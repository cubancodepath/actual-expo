import { runQuery, first, run } from "../db";
import { formatBalance } from "@/lib/format";
import { sendMessages } from "../sync";
import { undoable } from "../sync/undo";
import { Timestamp } from "../crdt";
import { monthToInt } from "@/lib/date";
import type { ZeroBudgetRow, CategoryGroupRow, CategoryRow } from "../db/types";
import type { BudgetMonth, BudgetGroup, BudgetCategory } from "./types";
import { inferGoalFromDef } from "../goals";
import { ALIVE_TX_FILTER } from "../db/filters";
import { computeToBudgetFull } from "./toBudget";
import { getSpreadsheet } from "../spreadsheet/instance";
import { sheetForMonth, envelopeBudget } from "../spreadsheet/bindings";

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
// toBudget = cumulativeIncome - cumulativeBudgeted - bufferedSelected + overspendingPenalty
// ---------------------------------------------------------------------------

export async function computeToBudget(
  month: string,
  opts?: { groups?: CategoryGroupRow[]; categories?: CategoryRow[] },
): Promise<number> {
  const result = await computeToBudgetFull({
    month,
    monthInt: monthToInt(month),
    groups: opts?.groups,
    categories: opts?.categories,
  });
  return result.toBudget;
}

// ---------------------------------------------------------------------------
// getBudgetMonth
// ---------------------------------------------------------------------------

export async function getBudgetMonth(month: string): Promise<BudgetMonth> {
  const monthInt = monthToInt(month);
  const startDate = monthInt * 100 + 1;
  const endDate = monthInt * 100 + 31;

  const groups = await runQuery<CategoryGroupRow>(
    "SELECT * FROM category_groups WHERE tombstone = 0 ORDER BY sort_order ASC",
  );
  const categories = await runQuery<CategoryRow>(
    "SELECT * FROM categories WHERE tombstone = 0 ORDER BY sort_order ASC",
  );
  const budgetRows = await runQuery<ZeroBudgetRow>("SELECT * FROM zero_budgets WHERE month = ?", [
    monthInt,
  ]);
  const budgetMap = new Map(budgetRows.map((r) => [r.category, r.amount]));
  const carryoverMap = new Map(budgetRows.map((r) => [r.category, r.carryover === 1]));
  const goalMap = new Map(budgetRows.map((r) => [r.category, r.goal]));
  const longGoalMap = new Map(budgetRows.map((r) => [r.category, r.long_goal === 1]));

  // Current-month transaction amounts per category (FIX #2 & #3: proper filters)
  const currentMonthRows = await runQuery<{ category: string; amount: number }>(
    `SELECT COALESCE(cm.transferId, t.category) AS category, SUM(t.amount) AS amount
     FROM transactions t
     LEFT JOIN category_mapping cm ON cm.id = t.category
     JOIN accounts a ON t.acct = a.id AND a.offbudget = 0
     WHERE ${ALIVE_TX_FILTER}
       AND t.date >= ? AND t.date <= ?
       AND t.category IS NOT NULL
     GROUP BY COALESCE(cm.transferId, t.category)`,
    [startDate, endDate],
  );
  const currentMap = new Map(currentMonthRows.map((r) => [r.category, r.amount]));

  // ── Carryover chain ──
  const groupMap = new Map(groups.map((g) => [g.id, g]));
  const expenseCatIds = categories
    .filter((c) => {
      const g = groupMap.get(c.cat_group);
      return g && g.is_income === 0;
    })
    .map((c) => c.id);

  const { carryIns, prevCoFlags, currentCoFlags, overspendingPenalty } =
    await computeCarryoverChain(monthInt, expenseCatIds);

  // ── Cumulative To Budget (delegated to shared computation) ──
  const { toBudget, buffered: bufferedSelected } = await computeToBudgetFull({
    month,
    monthInt,
    groups,
    categories,
    budgetRows,
    currentSpendingMap: currentMap,
  });

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
      const budgeted = isIncome ? 0 : (budgetMap.get(c.id) ?? 0);
      const spent = currentMap.get(c.id) ?? 0;
      const carryIn = isIncome ? 0 : (carryIns.get(c.id) ?? 0);
      // carryover flag: current month's setting (controls what carries to NEXT month)
      const carryover = currentCoFlags.get(c.id) ?? carryoverMap.get(c.id) ?? false;
      const balance = isIncome ? spent : budgeted + spent + carryIn;

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

  // Get all existing zero_budgets rows for this category from current month onward
  const futureRows = await runQuery<ZeroBudgetRow>(
    "SELECT * FROM zero_budgets WHERE category = ? AND month >= ?",
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
        dataset: "zero_budgets",
        row: id,
        column: "month",
        value: r.month,
      },
      {
        timestamp: Timestamp.send()!,
        dataset: "zero_budgets",
        row: id,
        column: "category",
        value: categoryId,
      },
      {
        timestamp: Timestamp.send()!,
        dataset: "zero_budgets",
        row: id,
        column: "carryover",
        value: flag ? 1 : 0,
      },
    ];
  });

  await sendMessages(messages);
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
): Promise<number> {
  const row = await first<{ buffered: number }>(
    "SELECT buffered FROM zero_budget_months WHERE id = ?",
    [month],
  );
  const existing = row?.buffered ?? 0;

  if (currentToBudget <= 0 && existing === 0) return 0;

  const delta = amount - existing;
  const newBuffered = calcBufferedAmount(currentToBudget, existing, delta);

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
  const displayAmount = formatBalance(Math.abs(opts.amountCents));
  const displayDay = new Date().toLocaleDateString(undefined, { month: "long", day: "numeric" });
  const line = `- Reassigned ${displayAmount} from ${opts.fromName} → ${opts.toName} on ${displayDay}`;

  const existing = await first<{ note: string }>("SELECT note FROM notes WHERE id = ?", [noteId]);

  if (existing) {
    await run("UPDATE notes SET note = ? WHERE id = ?", [existing.note + "\n" + line, noteId]);
  } else {
    await run("INSERT INTO notes (id, note) VALUES (?, ?)", [noteId, line]);
  }
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

  const [fromRow, toRow] = await Promise.all([
    first<{ amount: number }>("SELECT amount FROM zero_budgets WHERE month = ? AND category = ?", [
      monthInt,
      fromCategoryId,
    ]),
    first<{ amount: number }>("SELECT amount FROM zero_budgets WHERE month = ? AND category = ?", [
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
      dataset: "zero_budgets",
      row: fromId,
      column: "month",
      value: monthInt,
    },
    {
      timestamp: Timestamp.send()!,
      dataset: "zero_budgets",
      row: fromId,
      column: "category",
      value: fromCategoryId,
    },
    {
      timestamp: Timestamp.send()!,
      dataset: "zero_budgets",
      row: fromId,
      column: "amount",
      value: fromBudgeted - amountCents,
    },
    {
      timestamp: Timestamp.send()!,
      dataset: "zero_budgets",
      row: toId,
      column: "month",
      value: monthInt,
    },
    {
      timestamp: Timestamp.send()!,
      dataset: "zero_budgets",
      row: toId,
      column: "category",
      value: toCategoryId,
    },
    {
      timestamp: Timestamp.send()!,
      dataset: "zero_budgets",
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

  // Batch-fetch all budget rows (target + sources) in a single query
  const allCategoryIds = [targetCategoryId, ...validSources.map((s) => s.categoryId)];
  const placeholders = allCategoryIds.map(() => "?").join(",");
  const budgetRows = await runQuery<{ category: string; amount: number }>(
    `SELECT category, amount FROM zero_budgets WHERE month = ? AND category IN (${placeholders})`,
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
          dataset: "zero_budgets",
          row: sourceId,
          column: "month",
          value: monthInt,
        },
        {
          timestamp: Timestamp.send()!,
          dataset: "zero_budgets",
          row: sourceId,
          column: "category",
          value: source.categoryId,
        },
        {
          timestamp: Timestamp.send()!,
          dataset: "zero_budgets",
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
          dataset: "zero_budgets",
          row: sourceId,
          column: "month",
          value: monthInt,
        },
        {
          timestamp: Timestamp.send()!,
          dataset: "zero_budgets",
          row: sourceId,
          column: "category",
          value: source.categoryId,
        },
        {
          timestamp: Timestamp.send()!,
          dataset: "zero_budgets",
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
      dataset: "zero_budgets",
      row: targetId,
      column: "month",
      value: monthInt,
    },
    {
      timestamp: Timestamp.send()!,
      dataset: "zero_budgets",
      row: targetId,
      column: "category",
      value: targetCategoryId,
    },
    {
      timestamp: Timestamp.send()!,
      dataset: "zero_budgets",
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

  await sendMessages([
    {
      timestamp: Timestamp.send()!,
      dataset: "zero_budgets",
      row: id,
      column: "month",
      value: monthInt,
    },
    {
      timestamp: Timestamp.send()!,
      dataset: "zero_budgets",
      row: id,
      column: "category",
      value: categoryId,
    },
    {
      timestamp: Timestamp.send()!,
      dataset: "zero_budgets",
      row: id,
      column: "amount",
      value: amount,
    },
  ]);
});

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
  await setBudgetAmount(month, categoryId, current + amountCents);
});
