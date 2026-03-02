import { runQuery, first } from '../db';
import { sendMessages } from '../sync';
import { Timestamp } from '../crdt';
import type { ZeroBudgetRow, CategoryGroupRow, CategoryRow } from '../db/types';
import type { BudgetMonth, BudgetGroup, BudgetCategory } from './types';

/** Convert 'YYYY-MM' to YYYYMM integer */
function monthToInt(month: string): number {
  return parseInt(month.replace('-', ''), 10);
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

async function computeCarryoverChain(
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

  // ── Load ALL historical zero_budgets rows (strictly before current month) ──
  const histBudgets = await runQuery<ZeroBudgetRow>(
    'SELECT * FROM zero_budgets WHERE month < ? ORDER BY month ASC',
    [monthInt],
  );

  // ── Load current month's carryover flags ──
  const currentMonthBudgets = await runQuery<ZeroBudgetRow>(
    'SELECT * FROM zero_budgets WHERE month = ?',
    [monthInt],
  );
  const currentCoFlags = new Map<string, boolean>(
    currentMonthBudgets.map(r => [r.category, r.carryover === 1]),
  );

  if (histBudgets.length === 0) return { ...empty, currentCoFlags };

  // ── Distinct historical months, ascending ──
  const histMonths = [...new Set(histBudgets.map(r => r.month))].sort((a, b) => a - b);
  const firstHistMonth = histMonths[0];
  const lastHistMonth  = histMonths[histMonths.length - 1];

  // ── Build lookup maps ──
  const zbLookup = new Map<string, ZeroBudgetRow>();
  for (const r of histBudgets) zbLookup.set(`${r.month}-${r.category}`, r);

  // Spent amounts for all historical months per category (using same category_mapping join)
  const histSpent = await runQuery<{ month: number; category: string; amount: number }>(
    `SELECT t.date / 100 AS month,
            COALESCE(cm.transferId, t.category) AS category,
            SUM(t.amount) AS amount
     FROM transactions t
     LEFT JOIN category_mapping cm ON cm.id = t.category
     JOIN accounts a ON a.id = t.acct AND a.offbudget = 0 AND a.tombstone = 0
     WHERE t.tombstone = 0
       AND t.isParent = 0
       AND t.category IS NOT NULL
       AND t.date >= ? AND t.date <= ?
     GROUP BY t.date / 100, COALESCE(cm.transferId, t.category)`,
    [firstHistMonth * 100 + 1, lastHistMonth * 100 + 31],
  );
  const spentLookup = new Map<string, number>();
  for (const r of histSpent) spentLookup.set(`${r.month}-${r.category}`, r.amount);

  // Union of all categories that ever appeared
  const allCatIds = new Set<string>([
    ...categoryIds,
    ...histBudgets.map(r => r.category),
  ]);

  // ── Iterate month by month ──
  let leftoverMap  = new Map<string, number>();  // catId → leftover
  let prevCoFlagMap = new Map<string, boolean>(); // catId → carryover flag (for computing carry-in)
  let totalPenalty = 0;

  for (const m of histMonths) {
    const newLeftover  = new Map<string, number>();
    const newCoFlags   = new Map<string, boolean>();

    for (const catId of allCatIds) {
      const key     = `${m}-${catId}`;
      const zbRow   = zbLookup.get(key);
      const budgeted = zbRow?.amount ?? 0;
      const thisFlag = zbRow?.carryover === 1;
      const spent    = spentLookup.get(key) ?? 0;

      const prevLeft   = leftoverMap.get(catId) ?? 0;
      const prevFlag   = prevCoFlagMap.get(catId) ?? false;
      const carryIn    = prevFlag ? prevLeft : Math.max(0, prevLeft);
      const thisLeft   = budgeted + spent + carryIn;

      newLeftover.set(catId, thisLeft);
      newCoFlags.set(catId, thisFlag);

      // Overspending penalty: negative leftover that WON'T roll into next month
      // (because carryover flag is OFF), so it reduces the general pool instead.
      if (!thisFlag && thisLeft < 0) {
        totalPenalty += thisLeft; // negative cents
      }
    }

    leftoverMap   = newLeftover;
    prevCoFlagMap = newCoFlags;
  }

  // ── Build carry-ins for the current month ──
  const carryIns    = new Map<string, number>();
  const prevCoFlags = new Map<string, boolean>();

  for (const catId of categoryIds) {
    const prevLeft = leftoverMap.get(catId)   ?? 0;
    const prevFlag = prevCoFlagMap.get(catId) ?? false;
    const carryIn  = prevFlag ? prevLeft : Math.max(0, prevLeft);
    carryIns.set(catId, carryIn);
    prevCoFlags.set(catId, prevFlag);
  }

  return { carryIns, prevCoFlags, currentCoFlags, overspendingPenalty: totalPenalty };
}

// ---------------------------------------------------------------------------
// getBudgetMonth
// ---------------------------------------------------------------------------

export async function getBudgetMonth(month: string): Promise<BudgetMonth> {
  const monthInt  = monthToInt(month);
  const startDate = monthInt * 100 + 1;
  const endDate   = monthInt * 100 + 31;

  const groups = await runQuery<CategoryGroupRow>(
    'SELECT * FROM category_groups WHERE tombstone = 0 ORDER BY sort_order ASC',
  );
  const categories = await runQuery<CategoryRow>(
    'SELECT * FROM categories WHERE tombstone = 0 ORDER BY sort_order ASC',
  );
  const budgetRows = await runQuery<ZeroBudgetRow>(
    'SELECT * FROM zero_budgets WHERE month = ?',
    [monthInt],
  );
  const budgetMap    = new Map(budgetRows.map(r => [r.category, r.amount]));
  const carryoverMap = new Map(budgetRows.map(r => [r.category, r.carryover === 1]));

  // Current-month transaction amounts per category
  const currentMonthRows = await runQuery<{ category: string; amount: number }>(
    `SELECT COALESCE(cm.transferId, t.category) AS category, SUM(t.amount) AS amount
     FROM transactions t
     LEFT JOIN category_mapping cm ON cm.id = t.category
     JOIN accounts a ON t.acct = a.id AND a.offbudget = 0 AND a.tombstone = 0
     WHERE t.tombstone = 0
       AND t.isParent = 0
       AND t.date >= ? AND t.date <= ?
       AND t.category IS NOT NULL
     GROUP BY COALESCE(cm.transferId, t.category)`,
    [startDate, endDate],
  );
  const currentMap = new Map(currentMonthRows.map(r => [r.category, r.amount]));

  // ── Carryover chain ──
  const expenseCatIds = categories
    .filter(c => {
      const g = groups.find(g => g.id === c.cat_group);
      return g && g.is_income === 0;
    })
    .map(c => c.id);

  const { carryIns, prevCoFlags, currentCoFlags, overspendingPenalty } =
    await computeCarryoverChain(monthInt, expenseCatIds);

  // ── Cumulative To Budget ──
  // toBudget[M] = SUM(income[0..M]) - SUM(expBudgeted[0..M]) - buffered[M] + overspendingPenalty
  //
  // overspendingPenalty (negative) adjusts for months where expense categories
  // were overspent WITHOUT carryover — those amounts reduce the general pool.

  const cumulativeIncomeRow = await first<{ total: number }>(
    `SELECT COALESCE(SUM(t.amount), 0) AS total
     FROM transactions t
     LEFT JOIN category_mapping cm ON cm.id = t.category
     JOIN categories c  ON c.id = COALESCE(cm.transferId, t.category) AND c.tombstone = 0
     JOIN accounts a    ON a.id = t.acct AND a.offbudget = 0 AND a.tombstone = 0
     JOIN category_groups g ON g.id = c.cat_group AND g.is_income = 1
     WHERE t.tombstone = 0
       AND t.isParent = 0
       AND t.date <= ?`,
    [endDate],
  );

  const cumulativeBudgetedRow = await first<{ total: number }>(
    `SELECT COALESCE(SUM(zb.amount), 0) AS total
     FROM zero_budgets zb
     JOIN categories c ON c.id = zb.category AND c.tombstone = 0
     JOIN category_groups g ON g.id = c.cat_group AND g.is_income = 0
     WHERE zb.month <= ?`,
    [monthInt],
  );

  const bufferedRow = await first<{ buffered: number }>(
    'SELECT buffered FROM zero_budget_months WHERE id = ?',
    [String(monthInt)],
  );
  const buffered = bufferedRow?.buffered ?? 0;

  const cumulativeIncome   = cumulativeIncomeRow?.total   ?? 0;
  const cumulativeBudgeted = cumulativeBudgetedRow?.total ?? 0;
  const toBudget = cumulativeIncome - cumulativeBudgeted - buffered + overspendingPenalty;

  // ── Build per-group / per-category data ──
  let displayIncome   = 0;
  let displayBudgeted = 0;
  let displaySpent    = 0;

  const budgetGroups: BudgetGroup[] = groups.map(g => {
    const groupCats = categories.filter(c => c.cat_group === g.id);
    const isIncome  = g.is_income === 1;

    let groupBudgeted = 0;
    let groupSpent    = 0;
    let groupCarryIn  = 0;

    const budgetCats: BudgetCategory[] = groupCats.map(c => {
      const budgeted   = isIncome ? 0 : (budgetMap.get(c.id) ?? 0);
      const spent      = currentMap.get(c.id) ?? 0;
      const carryIn    = isIncome ? 0 : (carryIns.get(c.id) ?? 0);
      // carryover flag: current month's setting (controls what carries to NEXT month)
      const carryover  = currentCoFlags.get(c.id) ?? carryoverMap.get(c.id) ?? false;
      const balance    = isIncome ? spent : budgeted + spent + carryIn;

      groupBudgeted += budgeted;
      groupSpent    += spent;
      groupCarryIn  += carryIn;

      return { id: c.id, name: c.name, budgeted, spent, balance, carryIn, carryover };
    });

    if (isIncome) {
      displayIncome += groupSpent;
    } else {
      displayBudgeted += groupBudgeted;
      displaySpent    += groupSpent;
    }

    return {
      id:         g.id,
      name:       g.name,
      is_income:  isIncome,
      budgeted:   groupBudgeted,
      spent:      groupSpent,
      balance:    isIncome ? groupSpent : groupBudgeted + groupSpent + groupCarryIn,
      categories: budgetCats,
    };
  });

  return {
    month,
    income:   displayIncome,
    budgeted: displayBudgeted,
    spent:    displaySpent,
    toBudget,
    buffered,
    groups:   budgetGroups,
  };
}

// ---------------------------------------------------------------------------
// Set category carryover
//
// Mirrors loot-core's setCategoryCarryover(): sets the flag on the current
// month AND all future months that already have a zero_budgets row.
// When flag=true, also ensures a row exists for the current month.
// ---------------------------------------------------------------------------

export async function setCategoryCarryover(
  month: string,
  categoryId: string,
  flag: boolean,
): Promise<void> {
  const monthInt = monthToInt(month);

  // Get all existing zero_budgets rows for this category from current month onward
  const futureRows = await runQuery<ZeroBudgetRow>(
    'SELECT * FROM zero_budgets WHERE category = ? AND month >= ?',
    [categoryId, monthInt],
  );

  // Always ensure there's a row for the current month
  const hasCurrentMonth = futureRows.some(r => r.month === monthInt);
  const rowsToUpdate = hasCurrentMonth
    ? futureRows
    : [
        // Synthetic row — just for generating the CRDT message for this month
        { id: `${monthInt}-${categoryId}`, month: monthInt, category: categoryId,
          amount: 0, carryover: 0, goal: null, long_goal: null } as ZeroBudgetRow,
        ...futureRows,
      ];

  const messages = rowsToUpdate.flatMap(r => {
    const id = r.id ?? `${r.month}-${r.category}`;
    return [
      // Ensure month + category columns are populated (no-op if row already exists)
      { timestamp: Timestamp.send()!, dataset: 'zero_budgets', row: id, column: 'month',    value: r.month },
      { timestamp: Timestamp.send()!, dataset: 'zero_budgets', row: id, column: 'category', value: categoryId },
      { timestamp: Timestamp.send()!, dataset: 'zero_budgets', row: id, column: 'carryover', value: flag ? 1 : 0 },
    ];
  });

  await sendMessages(messages);
}

// ---------------------------------------------------------------------------
// Hold for Next Month
// ---------------------------------------------------------------------------

function calcBufferedAmount(toBudget: number, buffered: number, delta: number): number {
  const clamped = Math.min(Math.max(delta, -buffered), Math.max(toBudget, 0));
  return buffered + clamped;
}

export async function holdForNextMonth(
  month: string,
  amount: number,
  currentToBudget: number,
): Promise<number> {
  const monthInt = monthToInt(month);
  const monthId  = String(monthInt);

  const row      = await first<{ buffered: number }>('SELECT buffered FROM zero_budget_months WHERE id = ?', [monthId]);
  const existing = row?.buffered ?? 0;

  if (currentToBudget <= 0 && existing === 0) return 0;

  const delta       = amount - existing;
  const newBuffered = calcBufferedAmount(currentToBudget, existing, delta);

  await sendMessages([{
    timestamp: Timestamp.send()!,
    dataset:   'zero_budget_months',
    row:       monthId,
    column:    'buffered',
    value:     newBuffered,
  }]);

  return newBuffered;
}

export async function resetHold(month: string): Promise<void> {
  const monthInt = monthToInt(month);
  await sendMessages([{
    timestamp: Timestamp.send()!,
    dataset:   'zero_budget_months',
    row:       String(monthInt),
    column:    'buffered',
    value:     0,
  }]);
}

// ---------------------------------------------------------------------------
// Transfer money between categories (cover overspending / move surplus)
//
// Mirrors loot-core's transferCategory() + coverOverspending():
//   source budget  -= amount
//   dest   budget  += amount
// ---------------------------------------------------------------------------

export async function transferBetweenCategories(
  month: string,
  fromCategoryId: string,
  toCategoryId: string,
  amountCents: number, // positive integer
): Promise<void> {
  if (amountCents <= 0) return;

  const monthInt = monthToInt(month);

  const [fromRow, toRow] = await Promise.all([
    first<{ amount: number }>(
      'SELECT amount FROM zero_budgets WHERE month = ? AND category = ?',
      [monthInt, fromCategoryId],
    ),
    first<{ amount: number }>(
      'SELECT amount FROM zero_budgets WHERE month = ? AND category = ?',
      [monthInt, toCategoryId],
    ),
  ]);

  const fromBudgeted = fromRow?.amount ?? 0;
  const toBudgeted   = toRow?.amount   ?? 0;
  const fromId       = `${monthInt}-${fromCategoryId}`;
  const toId         = `${monthInt}-${toCategoryId}`;

  await sendMessages([
    { timestamp: Timestamp.send()!, dataset: 'zero_budgets', row: fromId, column: 'month',    value: monthInt },
    { timestamp: Timestamp.send()!, dataset: 'zero_budgets', row: fromId, column: 'category', value: fromCategoryId },
    { timestamp: Timestamp.send()!, dataset: 'zero_budgets', row: fromId, column: 'amount',   value: fromBudgeted - amountCents },
    { timestamp: Timestamp.send()!, dataset: 'zero_budgets', row: toId,   column: 'month',    value: monthInt },
    { timestamp: Timestamp.send()!, dataset: 'zero_budgets', row: toId,   column: 'category', value: toCategoryId },
    { timestamp: Timestamp.send()!, dataset: 'zero_budgets', row: toId,   column: 'amount',   value: toBudgeted + amountCents },
  ]);
}

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

export async function setBudgetAmount(
  month: string,
  categoryId: string,
  amount: number,
): Promise<void> {
  const monthInt = monthToInt(month);
  const id       = `${monthInt}-${categoryId}`;

  await sendMessages([
    { timestamp: Timestamp.send()!, dataset: 'zero_budgets', row: id, column: 'month',    value: monthInt },
    { timestamp: Timestamp.send()!, dataset: 'zero_budgets', row: id, column: 'category', value: categoryId },
    { timestamp: Timestamp.send()!, dataset: 'zero_budgets', row: id, column: 'amount',   value: amount },
  ]);
}
