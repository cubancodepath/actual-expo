import { runQuery, first } from '../db';
import { sendMessages } from '../sync';
import { Timestamp } from '../crdt';
import type { ZeroBudgetRow, CategoryGroupRow, CategoryRow } from '../db/types';
import type { BudgetMonth, BudgetGroup, BudgetCategory } from './types';

/** Convert 'YYYY-MM' to YYYYMM integer */
function monthToInt(month: string): number {
  return parseInt(month.replace('-', ''), 10);
}

/** Convert YYYYMM int to 'YYYY-MM' string */
function intToMonth(m: number): string {
  const s = String(m);
  return `${s.slice(0, 4)}-${s.slice(4, 6)}`;
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

  // Calculate spent per category from transactions
  const spentRows = await runQuery<{ category: string; spent: number }>(
    `SELECT category, SUM(amount) as spent
     FROM transactions
     WHERE tombstone = 0
       AND isParent = 0
       AND starting_balance_flag = 0
       AND date >= ? AND date <= ?
       AND category IS NOT NULL
     GROUP BY category`,
    [startDate, endDate],
  );
  const spentMap = new Map(spentRows.map(r => [r.category, r.spent]));

  let totalIncome = 0;
  let totalBudgeted = 0;
  let totalSpent = 0;

  const budgetGroups: BudgetGroup[] = groups.map(g => {
    const groupCats = categories.filter(c => c.cat_group === g.id);

    let groupBudgeted = 0;
    let groupSpent = 0;

    const budgetCats: BudgetCategory[] = groupCats.map(c => {
      const budgeted = budgetMap.get(c.id) ?? 0;
      const spent = spentMap.get(c.id) ?? 0;
      const balance = budgeted + spent; // spent is negative for expenses

      groupBudgeted += budgeted;
      groupSpent += spent;

      return { id: c.id, name: c.name, budgeted, spent, balance };
    });

    if (g.is_income) {
      totalIncome += groupSpent; // income transactions are positive
    } else {
      totalBudgeted += groupBudgeted;
      totalSpent += groupSpent;
    }

    return {
      id: g.id,
      name: g.name,
      is_income: g.is_income === 1,
      budgeted: groupBudgeted,
      spent: groupSpent,
      balance: groupBudgeted + groupSpent,
      categories: budgetCats,
    };
  });

  const toBudget = totalIncome - totalBudgeted;

  return {
    month,
    income: totalIncome,
    budgeted: totalBudgeted,
    spent: totalSpent,
    toBudget,
    groups: budgetGroups,
  };
}

export async function setBudgetAmount(
  month: string,
  categoryId: string,
  amount: number,
): Promise<void> {
  const monthInt = monthToInt(month);
  const id = `${monthInt}_${categoryId}`;
  const ts = Timestamp.send()!;

  await sendMessages([
    { timestamp: ts, dataset: 'zero_budgets', row: id, column: 'month', value: monthInt },
    { timestamp: ts, dataset: 'zero_budgets', row: id, column: 'category', value: categoryId },
    { timestamp: ts, dataset: 'zero_budgets', row: id, column: 'amount', value: amount },
  ]);
}
