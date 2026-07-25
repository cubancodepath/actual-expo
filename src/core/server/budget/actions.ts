import { runQuery, first } from "@/core/server/db";
import { integerToCurrency } from "@/core/shared/util";
import { sendMessages } from "@/core/server/sync";
import { undoable } from "@/core/server/undo";
import { Timestamp } from "@/core/crdt";
import { monthToInt } from "@/core/shared/months";
import type { ZeroBudgetRow, CategoryGroupRow, CategoryRow } from "@/core/server/db/types";
import type { BudgetMonth, BudgetGroup, BudgetCategory } from "./types";
import { inferGoalFromDef } from "./goals";
import { getBudgetType } from "@/core/server/preferences";
import { ALIVE_TX_FILTER } from "@/core/server/db/filters";
import { sheetForMonth, envelopeBudget, trackingBudget } from "@/core/server/spreadsheet/bindings";
import { getSpreadsheet, ensureMonthRange } from "@/core/server/sheet";
import type { CellValue } from "@/core/server/spreadsheet/spreadsheet";

function num(v: CellValue): number {
  return typeof v === "number" ? v : 0;
}

// ---------------------------------------------------------------------------
// Carryover chain computation
//
// loot-core models category balance as a per-month spreadsheet cell:
//
//   leftover[M, C] = budgeted[M,C] + spent[M,C]
//                  + (prevCarryover ? prevLeftover : max(0, prevLeftover))
//
// Key insight: POSITIVE balances ALWAYS roll forward (regardless of flag).
// The `carryover` flag only determines whether NEGATIVE balances (overspending)
// also roll forward into the next month's category balance.
//
// When carryover=OFF and leftover<0, that negative is charged against the
// general "To Budget" pool (loot-core's "last-month-overspent").
//
// We iterate month-by-month from the earliest history to M-1, then return
// the carry-in for the current month and the accumulated overspending penalty.
// ---------------------------------------------------------------------------

type CarryoverResult = {
  /** carry-in cents for each category for the *current* month */
  carryIns: Map<string, number>;
  /** carryover flag from *previous* month per category (controls current display) */
  prevCoFlags: Map<string, boolean>;
  /** current month's carryover flag per category (from zero_budgets for month M) */
  currentCoFlags: Map<string, boolean>;
  /** sum of min(0, leftover) for cats without carryover — reduces toBudget */
  overspendingPenalty: number;
};

export async function computeCarryoverChain(
  monthInt: number,
  categoryIds: string[],
): Promise<CarryoverResult> {
  const empty: CarryoverResult = {
    carryIns: new Map(),
    prevCoFlags: new Map(),
    currentCoFlags: new Map(),
    overspendingPenalty: 0,
  };
  if (categoryIds.length === 0) return empty;

  // ── Load historical zero_budgets rows for non-tombstoned expense categories ──
  // Only include expense categories (is_income = 0) that haven't been deleted.
  // Including tombstoned/merged or income categories would corrupt the
  // overspending penalty because their budget rows still exist but their
  // transactions have been remapped to other categories via category_mapping.
  const histBudgets = await runQuery<ZeroBudgetRow>(
    `SELECT zb.* FROM zero_budgets zb
     JOIN categories c ON c.id = zb.category AND c.tombstone = 0
     JOIN category_groups g ON g.id = c.cat_group AND g.is_income = 0
     WHERE zb.month < ?
     ORDER BY zb.month ASC`,
    [monthInt],
  );

  // ── Load current month's carryover flags ──
  const currentMonthBudgets = await runQuery<ZeroBudgetRow>(
    "SELECT * FROM zero_budgets WHERE month = ?",
    [monthInt],
  );
  const currentCoFlags = new Map<string, boolean>(
    currentMonthBudgets.map((r) => [r.category, r.carryover === 1]),
  );

  // ── Build lookup maps for budget rows ──
  const zbLookup = new Map<string, ZeroBudgetRow>();
  for (const r of histBudgets) zbLookup.set(`${r.month}-${r.category}`, r);

  // ── Determine the full range of months to iterate ──
  // FIX #1: Include months with spending even if they have no budget rows.
  // Collect distinct months from both zero_budgets AND transactions.
  const budgetMonthSet = new Set(histBudgets.map((r) => r.month));

  const spentMonthRows = await runQuery<{ month: number }>(
    `SELECT DISTINCT t.date / 100 AS month
     FROM transactions t
     JOIN accounts a ON a.id = t.acct AND a.offbudget = 0
     WHERE ${ALIVE_TX_FILTER}
       AND t.category IS NOT NULL
       AND t.date / 100 < ?`,
    [monthInt],
  );
  for (const r of spentMonthRows) budgetMonthSet.add(r.month);

  const histMonths = [...budgetMonthSet].sort((a, b) => a - b);

  if (histMonths.length === 0) return { ...empty, currentCoFlags };

  const firstHistMonth = histMonths[0];
  const lastHistMonth = histMonths[histMonths.length - 1];

  // Spent amounts for all historical months per category
  const histSpent = await runQuery<{ month: number; category: string; amount: number }>(
    `SELECT t.date / 100 AS month,
            COALESCE(cm.transferId, t.category) AS category,
            SUM(t.amount) AS amount
     FROM transactions t
     LEFT JOIN category_mapping cm ON cm.id = t.category
     JOIN accounts a ON a.id = t.acct AND a.offbudget = 0
     WHERE ${ALIVE_TX_FILTER}
       AND t.category IS NOT NULL
       AND t.date >= ? AND t.date <= ?
     GROUP BY t.date / 100, COALESCE(cm.transferId, t.category)`,
    [firstHistMonth * 100 + 1, lastHistMonth * 100 + 31],
  );
  const spentLookup = new Map<string, number>();
  for (const r of histSpent) spentLookup.set(`${r.month}-${r.category}`, r.amount);

  // Use only the current expense categories — histBudgets is already filtered
  // to the same set, so the union just ensures coverage.
  const allCatIds = new Set<string>(categoryIds);

  // ── Iterate month by month ──
  let leftoverMap = new Map<string, number>(); // catId → leftover
  let prevCoFlagMap = new Map<string, boolean>(); // catId → carryover flag (for computing carry-in)
  let totalPenalty = 0;

  for (const m of histMonths) {
    const newLeftover = new Map<string, number>();
    const newCoFlags = new Map<string, boolean>();

    for (const catId of allCatIds) {
      const key = `${m}-${catId}`;
      const zbRow = zbLookup.get(key);
      const budgeted = zbRow?.amount ?? 0;
      const thisFlag = zbRow?.carryover === 1;
      const spent = spentLookup.get(key) ?? 0;

      const prevLeft = leftoverMap.get(catId) ?? 0;
      const prevFlag = prevCoFlagMap.get(catId) ?? false;
      const carryIn = prevFlag ? prevLeft : Math.max(0, prevLeft);
      const thisLeft = budgeted + spent + carryIn;

      newLeftover.set(catId, thisLeft);
      newCoFlags.set(catId, thisFlag);

      // Overspending penalty: negative leftover that WON'T roll into next month
      // (because carryover flag is OFF), so it reduces the general pool instead.
      if (!thisFlag && thisLeft < 0) {
        totalPenalty += thisLeft; // negative cents
      }
    }

    leftoverMap = newLeftover;
    prevCoFlagMap = newCoFlags;
  }

  // ── Build carry-ins for the current month ──
  const carryIns = new Map<string, number>();
  const prevCoFlags = new Map<string, boolean>();

  for (const catId of categoryIds) {
    const prevLeft = leftoverMap.get(catId) ?? 0;
    const prevFlag = prevCoFlagMap.get(catId) ?? false;
    const carryIn = prevFlag ? prevLeft : Math.max(0, prevLeft);
    carryIns.set(catId, carryIn);
    prevCoFlags.set(catId, prevFlag);
  }

  return { carryIns, prevCoFlags, currentCoFlags, overspendingPenalty: totalPenalty };
}

// ---------------------------------------------------------------------------
// Compute "To Budget" (available budget for a month)
//
// Reads the spreadsheet's incrementally-maintained "to-budget" cell — the
// single source of truth for this value (see spreadsheet/envelope.ts).
// Previously reimplemented independently in toBudget.ts; that duplicate
// path was removed once a parity test proved the two always agreed, to
// eliminate the risk of the two silently drifting apart over time.
// ---------------------------------------------------------------------------

export async function computeToBudget(month: string): Promise<number> {
  // Tracking budgets have no "To Budget" pool — there is no such cell.
  if ((await budgetTable()) === "reflect_budgets") return 0;
  await ensureMonthRange(month);
  return num(getSpreadsheet().getValue(sheetForMonth(month), envelopeBudget.toBudget));
}

// ---------------------------------------------------------------------------
// getBudgetMonth
// ---------------------------------------------------------------------------

export async function getBudgetMonth(month: string): Promise<BudgetMonth> {
  const monthInt = monthToInt(month);

  const groups = await runQuery<CategoryGroupRow>(
    "SELECT * FROM category_groups WHERE tombstone = 0 ORDER BY sort_order ASC",
  );
  const categories = await runQuery<CategoryRow>(
    "SELECT * FROM categories WHERE tombstone = 0 ORDER BY sort_order ASC",
  );
  const table = await budgetTable();
  const isTracking = table === "reflect_budgets";
  // Still needed for goal/long_goal: the spreadsheet's catGoal/catLongGoal
  // cells only understand a subset of template types (see goals/parse.ts's
  // richer inferGoalFromDef, used below) — not yet a reliable read source.
  const budgetRows = await runQuery<ZeroBudgetRow>(`SELECT * FROM ${table} WHERE month = ?`, [
    monthInt,
  ]);
  const goalMap = new Map(budgetRows.map((r) => [r.category, r.goal]));
  const longGoalMap = new Map(budgetRows.map((r) => [r.category, r.long_goal === 1]));

  await ensureMonthRange(month);
  const ss = getSpreadsheet();
  const sheet = sheetForMonth(month);

  // Tracking budgets have no To-Budget / buffer; they expose saved-vs-budgeted
  // and saved-vs-spent summaries instead. Per-category/per-group cell names are
  // aliased (same as envelope), so only the summary reads branch by type.
  const toBudget = isTracking ? 0 : num(ss.getValue(sheet, envelopeBudget.toBudget));
  const bufferedSelected = isTracking
    ? 0
    : num(ss.getValue(sheet, envelopeBudget.bufferedSelected));
  const totalSaved = isTracking ? num(ss.getValue(sheet, trackingBudget.totalSaved)) : undefined;
  const realSaved = isTracking ? num(ss.getValue(sheet, trackingBudget.realSaved)) : undefined;
  const totalBudgetIncome = isTracking
    ? num(ss.getValue(sheet, trackingBudget.totalBudgetIncome))
    : undefined;

  // ── Build per-group / per-category data ──
  let displayIncome = 0;
  let displayBudgeted = 0;
  let displaySpent = 0;

  // Expense groups first (by sort_order), income groups last
  const sortedGroups = [...groups].sort((a, b) => {
    if (a.is_income !== b.is_income) return a.is_income ? 1 : -1;
    return (a.sort_order ?? 0) - (b.sort_order ?? 0);
  });

  const budgetGroups: BudgetGroup[] = sortedGroups.map((g) => {
    const groupCats = categories.filter((c) => c.cat_group === g.id);
    const isIncome = g.is_income === 1;

    let groupBudgeted = 0;
    let groupSpent = 0;
    let groupCarryIn = 0;

    const budgetCats: BudgetCategory[] = groupCats.map((c) => {
      const spent = num(ss.getValue(sheet, envelopeBudget.catSpent(c.id)));
      const budgeted = isIncome ? 0 : num(ss.getValue(sheet, envelopeBudget.catBudgeted(c.id)));
      const balance = isIncome ? spent : num(ss.getValue(sheet, envelopeBudget.catBalance(c.id)));
      // carryIn isn't its own cell — back it out of the balance invariant
      // the cell's formula already maintains: balance = budgeted + spent + carryIn.
      const carryIn = isIncome ? 0 : balance - budgeted - spent;
      // carryover flag: current month's setting (controls what carries to NEXT month)
      const carryover = isIncome
        ? false
        : ss.getValue(sheet, envelopeBudget.catCarryover(c.id)) === true;

      groupBudgeted += budgeted;
      groupSpent += spent;
      groupCarryIn += carryIn;

      const goalDef = c.goal_def ?? null;

      // Always infer from goal_def (source of truth) when available.
      // Falls back to zero_budgets only for types inferGoalFromDef can't handle
      // (average, copy, percentage, spend — these need DB queries).
      let goal: number | null = null;
      let longGoal = false;
      const inferred = goalDef ? inferGoalFromDef(goalDef, month, carryIn) : null;
      if (inferred) {
        goal = inferred.goal;
        longGoal = inferred.longGoal;
      } else {
        goal = goalMap.get(c.id) ?? null;
        longGoal = longGoalMap.get(c.id) ?? false;
      }

      return {
        id: c.id,
        name: c.name,
        budgeted,
        spent,
        balance,
        carryIn,
        carryover,
        goal,
        longGoal,
        goalDef,
        hidden: c.hidden === 1,
      };
    });

    if (isIncome) {
      displayIncome += groupSpent;
    } else {
      displayBudgeted += groupBudgeted;
      displaySpent += groupSpent;
    }

    return {
      id: g.id,
      name: g.name,
      is_income: isIncome,
      hidden: g.hidden === 1,
      budgeted: groupBudgeted,
      spent: groupSpent,
      balance: isIncome ? groupSpent : groupBudgeted + groupSpent + groupCarryIn,
      categories: budgetCats,
    };
  });

  return {
    month,
    income: displayIncome,
    budgeted: displayBudgeted,
    spent: displaySpent,
    toBudget,
    buffered: bufferedSelected,
    groups: budgetGroups,
    ...(isTracking ? { totalSaved, realSaved, totalBudgetIncome } : {}),
  };
}

// ---------------------------------------------------------------------------
// Set category carryover
//
// Mirrors loot-core's setCategoryCarryover(): sets the flag on the current
// month AND all future months that already have a zero_budgets row.
// When flag=true, also ensures a row exists for the current month.
// ---------------------------------------------------------------------------

export const setCategoryCarryover = undoable(async function setCategoryCarryover(
  month: string,
  categoryId: string,
  flag: boolean,
): Promise<void> {
  const monthInt = monthToInt(month);
  const table = await budgetTable();

  // Get all existing budget rows for this category from current month onward
  const futureRows = await runQuery<ZeroBudgetRow>(
    `SELECT * FROM ${table} WHERE category = ? AND month >= ?`,
    [categoryId, monthInt],
  );

  // Always ensure there's a row for the current month
  const hasCurrentMonth = futureRows.some((r) => r.month === monthInt);
  const rowsToUpdate = hasCurrentMonth
    ? futureRows
    : [
        // Synthetic row — just for generating the CRDT message for this month
        {
          id: `${monthInt}-${categoryId}`,
          month: monthInt,
          category: categoryId,
          amount: 0,
          carryover: 0,
          goal: null,
          long_goal: null,
        } as ZeroBudgetRow,
        ...futureRows,
      ];

  const messages = rowsToUpdate.flatMap((r) => {
    const id = r.id ?? `${r.month}-${r.category}`;
    return [
      // Ensure month + category columns are populated (no-op if row already exists)
      {
        timestamp: Timestamp.send()!,
        dataset: table,
        row: id,
        column: "month",
        value: r.month,
      },
      {
        timestamp: Timestamp.send()!,
        dataset: table,
        row: id,
        column: "category",
        value: categoryId,
      },
      {
        timestamp: Timestamp.send()!,
        dataset: table,
        row: id,
        column: "carryover",
        value: flag ? 1 : 0,
      },
    ];
  });

  await sendMessages(messages);
});

// ---------------------------------------------------------------------------
// Reset income carryover (auto hold off for every income category)
//
// Mirrors loot-core's resetIncomeCarryover (server/budget/actions.ts): clears
// the carryover flag on ALL income categories for the given month only (it
// does not walk future months the way setCategoryCarryover does). Used when
// disabling the automatic "hold income for next month" behaviour wholesale.
// ---------------------------------------------------------------------------

export const resetIncomeCarryover = undoable(async function resetIncomeCarryover(
  month: string,
): Promise<void> {
  const monthInt = monthToInt(month);
  const incomeCats = await runQuery<{ id: string }>(
    "SELECT id FROM categories WHERE is_income = 1 AND tombstone = 0",
  );

  const messages = incomeCats.flatMap(({ id: categoryId }) => {
    const rowId = `${monthInt}-${categoryId}`;
    return [
      {
        timestamp: Timestamp.send()!,
        dataset: "zero_budgets",
        row: rowId,
        column: "month",
        value: monthInt,
      },
      {
        timestamp: Timestamp.send()!,
        dataset: "zero_budgets",
        row: rowId,
        column: "category",
        value: categoryId,
      },
      {
        timestamp: Timestamp.send()!,
        dataset: "zero_budgets",
        row: rowId,
        column: "carryover",
        value: 0,
      },
    ];
  });

  if (messages.length > 0) await sendMessages(messages);
});

// ---------------------------------------------------------------------------
// Hold for Next Month
// ---------------------------------------------------------------------------

function calcBufferedAmount(toBudget: number, buffered: number, delta: number): number {
  const clamped = Math.min(Math.max(delta, -buffered), Math.max(toBudget, 0));
  return buffered + clamped;
}

export const holdForNextMonth = undoable(async function holdForNextMonth(
  month: string,
  amount: number,
  currentToBudget: number,
): Promise<number | null> {
  // Mirrors loot-core's holdForNextMonth (server/budget/actions.ts): `amount`
  // is a DELTA added to the existing buffer, and holding only happens when
  // there is leftover money to hold (to-budget > 0). Reducing or removing a
  // hold goes through resetHold, exactly like the desktop app.
  if (currentToBudget <= 0) return null;

  const row = await first<{ buffered: number }>(
    "SELECT buffered FROM zero_budget_months WHERE id = ?",
    [month],
  );
  const newBuffered = calcBufferedAmount(currentToBudget, row?.buffered ?? 0, amount);

  await sendMessages([
    {
      timestamp: Timestamp.send()!,
      dataset: "zero_budget_months",
      row: month,
      column: "buffered",
      value: newBuffered,
    },
  ]);

  return newBuffered;
});

export const resetHold = undoable(async function resetHold(month: string): Promise<void> {
  await sendMessages([
    {
      timestamp: Timestamp.send()!,
      dataset: "zero_budget_months",
      row: month,
      column: "buffered",
      value: 0,
    },
  ]);
});

// ---------------------------------------------------------------------------
// Budget movement notes
//
// When money is moved between categories, append a note to the month's
// budget notes (same format as loot-core's addMovementNotes).
// ---------------------------------------------------------------------------

export async function addMovementNote(opts: {
  month: string;
  amountCents: number;
  fromName: string;
  toName: string;
}): Promise<void> {
  const noteId = `budget-${opts.month}`;
  const displayAmount = integerToCurrency(Math.abs(opts.amountCents));
  const displayDay = new Date().toLocaleDateString(undefined, { month: "long", day: "numeric" });
  const line = `- Reassigned ${displayAmount} from ${opts.fromName} → ${opts.toName} on ${displayDay}`;

  const existing = await first<{ note: string }>("SELECT note FROM notes WHERE id = ?", [noteId]);
  const newNote = existing ? existing.note + "\n" + line : line;

  // Routed through the CRDT message pipeline (like every other write in this
  // file) instead of a raw SQL write — `notes` is a synced dataset, so a
  // direct run() here would silently never sync to other devices.
  await sendMessages([
    {
      timestamp: Timestamp.send()!,
      dataset: "notes",
      row: noteId,
      column: "note",
      value: newNote,
    },
  ]);
}

// ---------------------------------------------------------------------------
// Transfer money between categories (cover overspending / move surplus)
//
// Mirrors loot-core's transferCategory() + coverOverspending():
//   source budget  -= amount
//   dest   budget  += amount
// ---------------------------------------------------------------------------

export const transferBetweenCategories = undoable(async function transferBetweenCategories(
  month: string,
  fromCategoryId: string,
  toCategoryId: string,
  amountCents: number, // positive integer
  fromName?: string,
  toName?: string,
): Promise<void> {
  if (amountCents <= 0) return;

  const monthInt = monthToInt(month);
  const table = await budgetTable();

  const [fromRow, toRow] = await Promise.all([
    first<{ amount: number }>(`SELECT amount FROM ${table} WHERE month = ? AND category = ?`, [
      monthInt,
      fromCategoryId,
    ]),
    first<{ amount: number }>(`SELECT amount FROM ${table} WHERE month = ? AND category = ?`, [
      monthInt,
      toCategoryId,
    ]),
  ]);

  const fromBudgeted = fromRow?.amount ?? 0;
  const toBudgeted = toRow?.amount ?? 0;
  const fromId = `${monthInt}-${fromCategoryId}`;
  const toId = `${monthInt}-${toCategoryId}`;

  await sendMessages([
    {
      timestamp: Timestamp.send()!,
      dataset: table,
      row: fromId,
      column: "month",
      value: monthInt,
    },
    {
      timestamp: Timestamp.send()!,
      dataset: table,
      row: fromId,
      column: "category",
      value: fromCategoryId,
    },
    {
      timestamp: Timestamp.send()!,
      dataset: table,
      row: fromId,
      column: "amount",
      value: fromBudgeted - amountCents,
    },
    {
      timestamp: Timestamp.send()!,
      dataset: table,
      row: toId,
      column: "month",
      value: monthInt,
    },
    {
      timestamp: Timestamp.send()!,
      dataset: table,
      row: toId,
      column: "category",
      value: toCategoryId,
    },
    {
      timestamp: Timestamp.send()!,
      dataset: table,
      row: toId,
      column: "amount",
      value: toBudgeted + amountCents,
    },
  ]);

  if (fromName && toName) {
    await addMovementNote({ month, amountCents, fromName, toName });
  }
});

// ---------------------------------------------------------------------------
// Transfer money from multiple sources to/from a single target category
//
// Unlike calling transferBetweenCategories() in a loop, this reads DB values
// once and accumulates the target amount correctly before sending all messages
// in a single bulk call — avoiding stale-read bugs with batched CRDT messages.
// ---------------------------------------------------------------------------

export const transferMultipleCategories = undoable(async function transferMultipleCategories(
  month: string,
  targetCategoryId: string,
  sources: Array<{ categoryId: string; amountCents: number; name?: string }>,
  direction: "to" | "from", // 'to' = sources give to target, 'from' = target gives to sources
  targetName?: string,
): Promise<void> {
  const validSources = sources.filter((s) => s.amountCents > 0);
  if (validSources.length === 0) return;

  const monthInt = monthToInt(month);
  const table = await budgetTable();

  // Batch-fetch all budget rows (target + sources) in a single query
  const allCategoryIds = [targetCategoryId, ...validSources.map((s) => s.categoryId)];
  const placeholders = allCategoryIds.map(() => "?").join(",");
  const budgetRows = await runQuery<{ category: string; amount: number }>(
    `SELECT category, amount FROM ${table} WHERE month = ? AND category IN (${placeholders})`,
    [monthInt, ...allCategoryIds],
  );
  const budgetMap = new Map(budgetRows.map((r) => [r.category, r.amount]));

  let targetBudgeted = budgetMap.get(targetCategoryId) ?? 0;

  const messages: Array<{
    timestamp: Timestamp;
    dataset: string;
    row: string;
    column: string;
    value: string | number | null;
  }> = [];
  const targetId = `${monthInt}-${targetCategoryId}`;

  for (const source of validSources) {
    const sourceBudgeted = budgetMap.get(source.categoryId) ?? 0;
    const sourceId = `${monthInt}-${source.categoryId}`;

    if (direction === "to") {
      messages.push(
        {
          timestamp: Timestamp.send()!,
          dataset: table,
          row: sourceId,
          column: "month",
          value: monthInt,
        },
        {
          timestamp: Timestamp.send()!,
          dataset: table,
          row: sourceId,
          column: "category",
          value: source.categoryId,
        },
        {
          timestamp: Timestamp.send()!,
          dataset: table,
          row: sourceId,
          column: "amount",
          value: sourceBudgeted - source.amountCents,
        },
      );
      targetBudgeted += source.amountCents;
    } else {
      messages.push(
        {
          timestamp: Timestamp.send()!,
          dataset: table,
          row: sourceId,
          column: "month",
          value: monthInt,
        },
        {
          timestamp: Timestamp.send()!,
          dataset: table,
          row: sourceId,
          column: "category",
          value: source.categoryId,
        },
        {
          timestamp: Timestamp.send()!,
          dataset: table,
          row: sourceId,
          column: "amount",
          value: sourceBudgeted + source.amountCents,
        },
      );
      targetBudgeted -= source.amountCents;
    }
  }

  messages.push(
    {
      timestamp: Timestamp.send()!,
      dataset: table,
      row: targetId,
      column: "month",
      value: monthInt,
    },
    {
      timestamp: Timestamp.send()!,
      dataset: table,
      row: targetId,
      column: "category",
      value: targetCategoryId,
    },
    {
      timestamp: Timestamp.send()!,
      dataset: table,
      row: targetId,
      column: "amount",
      value: targetBudgeted,
    },
  );

  await sendMessages(messages);

  // Add movement notes for each source transfer
  if (targetName) {
    for (const source of validSources) {
      if (source.name) {
        const fromName = direction === "to" ? source.name : targetName;
        const toName = direction === "to" ? targetName : source.name;
        await addMovementNote({ month, amountCents: source.amountCents, fromName, toName });
      }
    }
  }
});

// ---------------------------------------------------------------------------
// Category balances for a month (used by transaction category picker)
// ---------------------------------------------------------------------------

/**
 * Returns a map of categoryId → balance (leftover) for the given month.
 * This is the same "remaining" value shown in the budget screen.
 */
export async function getCategoryBalancesForMonth(month: string): Promise<Map<string, number>> {
  const data = await getBudgetMonth(month);
  const map = new Map<string, number>();
  for (const group of data.groups) {
    for (const cat of group.categories) {
      map.set(cat.id, cat.balance);
    }
  }
  return map;
}

// ---------------------------------------------------------------------------
// Set budget amount
// ---------------------------------------------------------------------------

export const setBudgetAmount = undoable(async function setBudgetAmount(
  month: string,
  categoryId: string,
  amount: number,
): Promise<void> {
  const monthInt = monthToInt(month);
  const id = `${monthInt}-${categoryId}`;
  const table = await budgetTable();

  await sendMessages([
    {
      timestamp: Timestamp.send()!,
      dataset: table,
      row: id,
      column: "month",
      value: monthInt,
    },
    {
      timestamp: Timestamp.send()!,
      dataset: table,
      row: id,
      column: "category",
      value: categoryId,
    },
    {
      timestamp: Timestamp.send()!,
      dataset: table,
      row: id,
      column: "amount",
      value: amount,
    },
  ]);
});

// ---------------------------------------------------------------------------
// Budget-type-aware writers (mirror loot-core getBudgetTable()/setBudget/setGoal)
//
// Envelope files write `zero_budgets`; tracking (report) files write
// `reflect_budgets`. Both tables have identical columns, so the writer only
// swaps the dataset. Used by the #cleanup evaluator. The rest of the write-path
// (setBudgetAmount/carryover/hold/goals-apply) is still envelope-only and is a
// separate tracking-write-path project — do NOT retrofit those here.
// ---------------------------------------------------------------------------

/** The budget table for the active file, per the `budgetType` preference. */
export async function budgetTable(): Promise<"zero_budgets" | "reflect_budgets"> {
  return (await getBudgetType()) === "tracking" ? "reflect_budgets" : "zero_budgets";
}

/** Set a category's absolute budgeted amount for a month (type-aware). */
export async function setBudget(month: string, categoryId: string, amount: number): Promise<void> {
  const monthInt = monthToInt(month);
  const id = `${monthInt}-${categoryId}`;
  const dataset = await budgetTable();
  await sendMessages([
    { timestamp: Timestamp.send()!, dataset, row: id, column: "month", value: monthInt },
    { timestamp: Timestamp.send()!, dataset, row: id, column: "category", value: categoryId },
    { timestamp: Timestamp.send()!, dataset, row: id, column: "amount", value: amount },
  ]);
}

/** Set a category's goal indicator for a month (type-aware). */
export async function setBudgetGoal(
  month: string,
  categoryId: string,
  goal: number | null,
  longGoal: boolean | null,
): Promise<void> {
  const monthInt = monthToInt(month);
  const id = `${monthInt}-${categoryId}`;
  const dataset = await budgetTable();
  await sendMessages([
    { timestamp: Timestamp.send()!, dataset, row: id, column: "month", value: monthInt },
    { timestamp: Timestamp.send()!, dataset, row: id, column: "category", value: categoryId },
    { timestamp: Timestamp.send()!, dataset, row: id, column: "goal", value: goal },
    {
      timestamp: Timestamp.send()!,
      dataset,
      row: id,
      column: "long_goal",
      value: longGoal === true ? 1 : longGoal === false ? 0 : null,
    },
  ]);
}

// ---------------------------------------------------------------------------
// Transfer from "To Budget" to a category
// ---------------------------------------------------------------------------

export const transferAvailable = undoable(async function transferAvailable(
  month: string,
  categoryId: string,
  amountCents: number,
): Promise<void> {
  const ss = getSpreadsheet();
  const sheet = sheetForMonth(month);
  const current = (ss.getValue(sheet, envelopeBudget.catBudgeted(categoryId)) as number) ?? 0;
  const next = current + amountCents;
  // Paint the new figure before the write lands; the recompute that follows
  // setBudgetAmount confirms it (or corrects it, if the write fails).
  ss.setByName(sheet, envelopeBudget.catBudgeted(categoryId), next);
  await setBudgetAmount(month, categoryId, next);
});
