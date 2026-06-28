export type BudgetCategory = {
  id: string;
  name: string;
  budgeted: number; // cents
  spent: number; // cents (negative = expense)
  balance: number; // cents (includes carryIn)
  carryIn: number; // cents rolled in from previous month (0 if none)
  carryover: boolean; // whether this category rolls overspending to next month
  goal: number | null; // goal amount in cents (from zero_budgets.goal)
  longGoal: boolean; // true = balance-based goal (#goal directive)
  goalDef: string | null; // raw goal_def JSON from categories table
  hidden: boolean;
};

export type BudgetGroup = {
  id: string;
  name: string;
  is_income: boolean;
  budgeted: number;
  spent: number;
  balance: number;
  hidden: boolean;
  categories: BudgetCategory[];
};

/** Structural-only category data (no spreadsheet values). */
export type BudgetCategoryData = {
  id: string;
  name: string;
  hidden: boolean;
  goalDef: string | null;
};

/** Structural-only group data (no spreadsheet values). */
export type BudgetGroupData = {
  id: string;
  name: string;
  is_income: boolean;
  hidden: boolean;
  categories: BudgetCategoryData[];
};

export type BudgetMonth = {
  month: string; // 'YYYY-MM'
  income: number;
  budgeted: number;
  spent: number;
  toBudget: number;
  buffered: number; // cents held for next month
  groups: BudgetGroup[];
};
