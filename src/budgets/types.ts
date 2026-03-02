export type BudgetCategory = {
  id: string;
  name: string;
  budgeted: number;    // cents
  spent: number;       // cents (negative = expense)
  balance: number;     // cents (includes carryIn)
  carryIn: number;     // cents rolled in from previous month (0 if none)
  carryover: boolean;  // whether this category rolls overspending to next month
};

export type BudgetGroup = {
  id: string;
  name: string;
  is_income: boolean;
  budgeted: number;
  spent: number;
  balance: number;
  categories: BudgetCategory[];
};

export type BudgetMonth = {
  month: string;   // 'YYYY-MM'
  income: number;
  budgeted: number;
  spent: number;
  toBudget: number;
  buffered: number;  // cents held for next month
  groups: BudgetGroup[];
};
