import { runQuery, first } from '../db';
import { sendMessages } from '../sync';
import { Timestamp } from '../crdt';
import type { ZeroBudgetRow, CategoryGroupRow, CategoryRow } from '../db/types';
import type { BudgetMonth, BudgetGroup, BudgetCategory } from './types';

/** Convert 'YYYY-MM' to YYYYMM integer */
function monthToInt(month: string): number {
  return parseInt(month.replace('-', ''), 10);
}

export async function getBudgetMonth(month: string): Promise<BudgetMonth> {
  const monthInt = monthToInt(month);
  // YYYYMMDD range for the month
  const startDate = monthInt * 100 + 1;
  const endDate = monthInt * 100 + 31;

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

  const budgetMap = new Map(budgetRows.map(r => [r.category, r.amount]));

  // Current-month transaction amounts grouped by category.
  // NOTE: we do NOT filter starting_balance_flag — starting balance transactions
  // in actual-budget ARE assigned to an income category ("Starting Balances")
  // and must be counted. loot-core's v_transactions_internal_alive does the same.
  // Resolve deleted categories through category_mapping so that transactions
  // that belonged to a deleted-but-transferred category still count toward
  // the transfer category's "spent" — mirrors loot-core's v_transactions_internal JOIN.
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

  // ---------------------------------------------------------------------------
  // Cumulative To Budget calculation — mirrors loot-core's carry-forward logic.
  //
  // loot-core computes To Budget via a recursive "from-last-month" chain:
  //   toBudget[M] = income[M] + toBudget[M-1] - budgeted[M]
  //
  // That's algebraically equivalent to:
  //   toBudget[M] = SUM(all income up to end of M) - SUM(all budgeted up to M)
  //
  // This means a starting balance from January still flows into March's
  // To Budget, just as it does in the original app.
  // ---------------------------------------------------------------------------

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

  // Read hold-for-next-month amount for this specific month.
  // Math proof: the cumulative formula only needs the *current* month's
  // buffered amount subtracted. Previous months' holds cancel algebraically:
  //   toBudget[M] = SUM(income[0..M]) - SUM(budgeted[0..M]) - buffered[M]
  const bufferedRow = await first<{ buffered: number }>(
    'SELECT buffered FROM zero_budget_months WHERE id = ?',
    [String(monthInt)],
  );
  const buffered = bufferedRow?.buffered ?? 0;

  const cumulativeIncome = cumulativeIncomeRow?.total ?? 0;
  const cumulativeBudgeted = cumulativeBudgetedRow?.total ?? 0;
  const toBudget = cumulativeIncome - cumulativeBudgeted - buffered;

  // ---------------------------------------------------------------------------
  // Build per-group / per-category data for the current month display
  // ---------------------------------------------------------------------------

  const incomeGroupIds = new Set(groups.filter(g => g.is_income === 1).map(g => g.id));

  let displayIncome = 0;
  let displayBudgeted = 0;
  let displaySpent = 0;

  const budgetGroups: BudgetGroup[] = groups.map(g => {
    const groupCats = categories.filter(c => c.cat_group === g.id);
    const isIncome = g.is_income === 1;

    let groupBudgeted = 0;
    let groupSpent = 0;

    const budgetCats: BudgetCategory[] = groupCats.map(c => {
      const budgeted = isIncome ? 0 : (budgetMap.get(c.id) ?? 0);
      const amount = currentMap.get(c.id) ?? 0;
      // For income groups, amount is positive (received).
      // For expense groups, amount is negative (spent).
      const spent = amount;
      const balance = isIncome ? spent : budgeted + spent;

      groupBudgeted += budgeted;
      groupSpent += spent;

      return { id: c.id, name: c.name, budgeted, spent, balance };
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
      budgeted: groupBudgeted,
      spent: groupSpent,
      balance: isIncome ? groupSpent : groupBudgeted + groupSpent,
      categories: budgetCats,
    };
  });

  return {
    month,
    income: displayIncome,
    budgeted: displayBudgeted,
    spent: displaySpent,
    toBudget,
    buffered,
    groups: budgetGroups,
  };
}

// ---------------------------------------------------------------------------
// Hold for Next Month
//
// Mirrors loot-core's holdForNextMonth() + calcBufferedAmount().
// The hold is stored in zero_budget_months via CRDT so it syncs across devices.
// ---------------------------------------------------------------------------

/**
 * Clamp the hold delta so:
 *   - buffered never goes below 0
 *   - you can't hold more than what's available to budget
 */
function calcBufferedAmount(toBudget: number, buffered: number, delta: number): number {
  const clamped = Math.min(Math.max(delta, -buffered), Math.max(toBudget, 0));
  return buffered + clamped;
}

/**
 * Hold `amount` cents for the next month.
 * Pass the current `toBudget` so we can validate/clamp.
 * Returns the actual new buffered amount (may differ from amount due to clamping).
 */
export async function holdForNextMonth(
  month: string,
  amount: number,
  currentToBudget: number,
): Promise<number> {
  const monthInt = monthToInt(month);
  const monthId = String(monthInt);

  const row = await first<{ buffered: number }>(
    'SELECT buffered FROM zero_budget_months WHERE id = ?',
    [monthId],
  );
  const existing = row?.buffered ?? 0;

  if (currentToBudget <= 0 && existing === 0) {
    // Nothing available to hold and nothing already held
    return 0;
  }

  // delta = how much to add (or remove) from the current hold
  const delta = amount - existing;
  const newBuffered = calcBufferedAmount(currentToBudget, existing, delta);

  await sendMessages([
    {
      timestamp: Timestamp.send()!,
      dataset: 'zero_budget_months',
      row: monthId,
      column: 'buffered',
      value: newBuffered,
    },
  ]);

  return newBuffered;
}

/**
 * Clear the hold for a month — sets buffered back to 0.
 */
export async function resetHold(month: string): Promise<void> {
  const monthInt = monthToInt(month);
  const monthId = String(monthInt);

  await sendMessages([
    {
      timestamp: Timestamp.send()!,
      dataset: 'zero_budget_months',
      row: monthId,
      column: 'buffered',
      value: 0,
    },
  ]);
}

export async function setBudgetAmount(
  month: string,
  categoryId: string,
  amount: number,
): Promise<void> {
  const monthInt = monthToInt(month);
  const id = `${monthInt}-${categoryId}`;

  await sendMessages([
    { timestamp: Timestamp.send()!, dataset: 'zero_budgets', row: id, column: 'month', value: monthInt },
    { timestamp: Timestamp.send()!, dataset: 'zero_budgets', row: id, column: 'category', value: categoryId },
    { timestamp: Timestamp.send()!, dataset: 'zero_budgets', row: id, column: 'amount', value: amount },
  ]);
}
