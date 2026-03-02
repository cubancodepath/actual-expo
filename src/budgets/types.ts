export type BudgetCategory = {
  id: string;
  name: string;
  budgeted: number;  // cents
  spent: number;     // cents (negative = expense)
  balance: number;   // cents
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
  groups: BudgetGroup[];
};
