import { create } from "zustand";
import {
  setBudgetAmount,
  holdForNextMonth,
  resetHold as resetHoldFn,
  setCategoryCarryover,
  transferBetweenCategories,
} from "../budgets";
import { currentMonth } from "../lib/date";
import { computeGoalAllocations } from "../goals/apply";
import type { ComputeGoalsResult } from "../goals/apply";
import type { BudgetMonth, BudgetGroup, BudgetCategory } from "../budgets/types";
import { getSpreadsheet } from "../spreadsheet/instance";
import { sheetForMonth, envelopeBudget } from "../spreadsheet/bindings";
import { initSpreadsheet } from "../spreadsheet/sync";
import { getCategories, getCategoryGroups } from "../categories";
import { inferGoalFromDef } from "../goals";
import { listen } from "../sync/syncEvents";

type CoverTarget = { catId: string; catName: string; balance: number };

type BudgetState = {
  month: string;
  data: BudgetMonth | null;
  loading: boolean;
  coverTarget: CoverTarget | null;
  setMonth(month: string): void;
  load(): Promise<void>;
  setAmount(categoryId: string, amount: number): Promise<void>;
  hold(amount: number): Promise<void>;
  resetHold(): Promise<void>;
  setCarryover(categoryId: string, flag: boolean): Promise<void>;
  transfer(fromCategoryId: string, toCategoryId: string, amountCents: number): Promise<void>;
  computeGoals(force?: boolean): Promise<ComputeGoalsResult>;
  setCoverTarget(target: CoverTarget | null): void;
};

/**
 * Build BudgetMonth from spreadsheet cell values.
 * Bridge function: reads individual cells and assembles the BudgetMonth structure
 * that 23 consumers expect.
 */
function buildBudgetMonthFromSpreadsheet(month: string): BudgetMonth | null {
  const ss = getSpreadsheet();
  const sheet = sheetForMonth(month);

  // Check if spreadsheet has cells for this month
  if (!ss.hasCell(sheet, envelopeBudget.toBudget)) return null;

  const num = (v: unknown) => (typeof v === "number" ? v : 0);

  // Get categories/groups from the latest data
  // We use a synchronous approach — categories are already loaded via liveQuery
  const toBudget = num(ss.getValue(sheet, envelopeBudget.toBudget));
  const totalBudgeted = num(ss.getValue(sheet, envelopeBudget.totalBudgeted));
  const totalSpent = num(ss.getValue(sheet, envelopeBudget.totalSpent));
  const totalIncome = num(ss.getValue(sheet, envelopeBudget.totalIncome));
  const buffered = num(ss.getValue(sheet, envelopeBudget.buffered));

  return {
    month,
    income: totalIncome,
    budgeted: totalBudgeted,
    spent: totalSpent,
    toBudget,
    buffered,
    groups: [], // Groups will be populated by loadFull()
  };
}

export const useBudgetStore = create<BudgetState>((set, get) => ({
  month: currentMonth(),
  data: null,
  loading: false,
  coverTarget: null,

  setMonth(month) {
    set({ month });
    // All months are already in the spreadsheet — just rebuild BudgetMonth from it
    get().load();
  },

  async load() {
    set({ loading: true });
    try {
      const month = get().month;

      // Try to build from spreadsheet first
      let data = buildBudgetMonthFromSpreadsheet(month);

      if (__DEV__ && data) {
        const ss = getSpreadsheet();
        const sheet = sheetForMonth(month);
        console.log(`[budgetStore] ${month}:`, {
          toBudget: ss.getValue(sheet, envelopeBudget.toBudget),
          totalIncome: ss.getValue(sheet, envelopeBudget.totalIncome),
          totalBudgeted: ss.getValue(sheet, envelopeBudget.totalBudgeted),
          fromLastMonth: ss.getValue(sheet, envelopeBudget.fromLastMonth),
          incomeAvailable: ss.getValue(sheet, envelopeBudget.incomeAvailable),
          lastMonthOverspent: ss.getValue(sheet, envelopeBudget.lastMonthOverspent),
          buffered: ss.getValue(sheet, envelopeBudget.buffered),
        });
      }

      if (data) {
        // Populate groups from categories
        const [cats, groups] = await Promise.all([getCategories(), getCategoryGroups()]);
        const ss = getSpreadsheet();
        const sheet = sheetForMonth(month);
        const num = (v: unknown) => (typeof v === "number" ? v : 0);

        data.groups = groups.map((g) => {
          const groupCats = cats.filter((c) => c.cat_group === g.id);
          const categories: BudgetCategory[] = groupCats.map((c) => {
            const goalInfo = c.goal_def ? inferGoalFromDef(c.goal_def) : null;
            return {
              id: c.id,
              name: c.name,
              budgeted: num(ss.getValue(sheet, envelopeBudget.catBudgeted(c.id))),
              spent: num(ss.getValue(sheet, envelopeBudget.catSpent(c.id))),
              balance: num(ss.getValue(sheet, envelopeBudget.catBalance(c.id))),
              carryIn: 0,
              carryover:
                ss.getValue(sheet, envelopeBudget.catCarryover(c.id)) === true ||
                ss.getValue(sheet, envelopeBudget.catCarryover(c.id)) === 1,
              goal: goalInfo?.goal ?? null,
              longGoal: goalInfo?.longGoal ?? false,
              goalDef: c.goal_def,
              hidden: c.hidden,
            };
          });

          return {
            id: g.id,
            name: g.name,
            is_income: g.is_income,
            budgeted: num(ss.getValue(sheet, envelopeBudget.groupBudgeted(g.id))),
            spent: num(ss.getValue(sheet, envelopeBudget.groupSpent(g.id))),
            balance: num(ss.getValue(sheet, envelopeBudget.groupBalance(g.id))),
            hidden: g.hidden,
            categories,
          };
        });
      } else {
        // Fallback: spreadsheet not initialized, use legacy query
        const { getBudgetMonth } = await import("../budgets");
        data = await getBudgetMonth(month);
      }

      set({ data });
    } finally {
      set({ loading: false });
    }
  },

  async setAmount(categoryId, amount) {
    const { month } = get();
    const ss = getSpreadsheet();
    const sheet = sheetForMonth(month);

    // Optimistic: update spreadsheet cell → triggers recomputation
    ss.setByName(sheet, envelopeBudget.catBudgeted(categoryId), amount);

    // Update store data from recomputed spreadsheet
    const data = get().data;
    if (data) {
      set({
        data: {
          ...data,
          toBudget: (ss.getValue(sheet, envelopeBudget.toBudget) as number) ?? data.toBudget,
        },
      });
    }

    // Persist to DB
    await setBudgetAmount(month, categoryId, amount);
  },

  async hold(amount) {
    const { month, data } = get();
    const currentToBudget = data?.toBudget ?? 0;
    await holdForNextMonth(month, amount, currentToBudget);
    await get().load();
  },

  async resetHold() {
    await resetHoldFn(get().month);
    await get().load();
  },

  async setCarryover(categoryId, flag) {
    await setCategoryCarryover(get().month, categoryId, flag);
  },

  async transfer(fromCategoryId, toCategoryId, amountCents) {
    await transferBetweenCategories(get().month, fromCategoryId, toCategoryId, amountCents);
    await get().load();
  },

  async computeGoals(force = false) {
    return computeGoalAllocations(get().month, force);
  },

  setCoverTarget(target) {
    set({ coverTarget: target });
  },
}));

// Auto-refresh when budget-related tables change via syncEvents
listen((event) => {
  const budgetTables = new Set([
    "zero_budgets",
    "zero_budget_months",
    "transactions",
    "categories",
    "category_groups",
  ]);
  if (event.tables.some((t) => budgetTables.has(t))) {
    useBudgetStore.getState().load();
  }
});
