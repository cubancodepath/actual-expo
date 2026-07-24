/**
 * Budget analysis spreadsheet — port of desktop-client
 * `reports/spreadsheets/budget-analysis-spreadsheet.ts`. Per-month budgeted vs
 * spent (plus the running envelope balance) for the selected expense categories.
 * Substitutions vs upstream:
 *  - `send('get-categories')` → `categories`/`categoryGroups` params (from the
 *    card's `useCategories`).
 *  - `send('envelope-budget-month', {month})` + `.find(cell.name.endsWith(...))`
 *    → read the reactive budget spreadsheet directly: `ensureMonthRange(month)`
 *    then `getSpreadsheet().getValue(sheetForMonth(month), envelopeBudget.catX(id))`.
 *  - the inline category filtering is replaced by the shared
 *    `filterCategoriesByConditions` (same AND/OR semantics).
 * Envelope-only, like upstream (it always reads the envelope month).
 */
import * as monthUtils from "@/core/shared/monthUtils";
import { getSpreadsheet } from "@/core/server/spreadsheet/globals";
import { sheetForMonth, envelopeBudget } from "@/core/server/spreadsheet/bindings";
import { ensureMonthRange } from "@/core/server/sheet";
import type { Category, CategoryGroup, RuleCondition } from "@/core/types/models";
import { filterCategoriesByConditions } from "../budgetDataQuery";

export type BudgetAnalysisIntervalData = {
  date: string;
  budgeted: number;
  spent: number;
  balance: number;
  overspendingAdjustment: number;
};

export type BudgetAnalysisData = {
  intervalData: BudgetAnalysisIntervalData[];
  startDate: string;
  endDate: string;
  totalBudgeted: number;
  totalSpent: number;
  totalOverspendingAdjustment: number;
  finalOverspendingAdjustment: number;
};

type CreateBudgetAnalysisSpreadsheetProps = {
  conditions?: RuleCondition[];
  conditionsOp?: "and" | "or";
  startDate: string;
  endDate: string;
  showHiddenCategories?: boolean;
  categories: Category[];
  categoryGroups: CategoryGroup[];
};

export function isBaseCategory(cat: Category, showHiddenCategories: boolean): boolean {
  return !cat.is_income && (showHiddenCategories || !cat.hidden);
}

/** Read a category's envelope cell for a month as a number. */
function readCell(month: string, cellName: string): number {
  return Number(getSpreadsheet().getValue(sheetForMonth(month), cellName)) || 0;
}

export function createBudgetAnalysisSpreadsheet({
  conditions = [],
  conditionsOp = "and",
  startDate,
  endDate,
  showHiddenCategories = false,
  categories,
  categoryGroups,
}: CreateBudgetAnalysisSpreadsheetProps) {
  return async (setData: (data: BudgetAnalysisData) => void) => {
    const relevantConditions = conditions.filter(
      (cond) =>
        !(cond as { customName?: unknown }).customName &&
        (cond.field === "category" || cond.field === "category_group"),
    );

    // Base set: expense categories only (hidden included when the flag is set so
    // historic data isn't misrepresented), then narrow by any category /
    // category_group conditions via the shared helper.
    const baseCategories = categories.filter((cat) => isBaseCategory(cat, showHiddenCategories));
    const categoriesToInclude =
      relevantConditions.length > 0
        ? filterCategoriesByConditions(
            baseCategories,
            categoryGroups,
            relevantConditions,
            conditionsOp,
          )
        : baseCategories;

    const intervals = monthUtils.rangeInclusive(
      monthUtils.getMonth(startDate),
      monthUtils.getMonth(endDate),
    );

    const intervalData: BudgetAnalysisIntervalData[] = [];

    // Seed the running balance from the month before the range (respecting
    // carryover flags), so the first month's balance is correct.
    let runningBalance = 0;
    const monthBeforeStart = monthUtils.subMonths(monthUtils.getMonth(startDate), 1);
    // Two boundary calls cover the whole range: ensureMonthRange guarantees a
    // contiguous built span, so every month in between is built after these.
    await ensureMonthRange(monthBeforeStart);
    await ensureMonthRange(monthUtils.getMonth(endDate));
    for (const cat of categoriesToInclude) {
      const catBalance = readCell(monthBeforeStart, envelopeBudget.catBalance(cat.id));
      const hasCarryover = Boolean(readCell(monthBeforeStart, envelopeBudget.catCarryover(cat.id)));
      if (catBalance > 0 || (catBalance < 0 && hasCarryover)) {
        runningBalance += catBalance;
      }
    }

    let totalBudgeted = 0;
    let totalSpent = 0;
    let totalOverspendingAdjustment = 0;
    let overspendingFromPrevMonth = 0;

    let monthsSinceYield = 0;
    for (const month of intervals) {
      // The synchronous cell reads below fan out to months × categories × 4 —
      // yield periodically so long ranges don't monopolize the JS thread.
      // Safe: useReport keeps previous data visible and cancels late results.
      if (++monthsSinceYield >= 8) {
        monthsSinceYield = 0;
        await new Promise((resolve) => setTimeout(resolve, 0));
      }

      let budgeted = 0;
      let spent = 0;
      let overspendingThisMonth = 0;
      let carryoverToNextMonth = 0;

      for (const cat of categoriesToInclude) {
        const catBudgeted = readCell(month, envelopeBudget.catBudgeted(cat.id));
        const catSpent = readCell(month, envelopeBudget.catSpent(cat.id));
        const catBalance = readCell(month, envelopeBudget.catBalance(cat.id));
        const hasCarryover = Boolean(readCell(month, envelopeBudget.catCarryover(cat.id)));

        budgeted += catBudgeted;
        spent += catSpent;

        if (catBalance > 0 || (catBalance < 0 && hasCarryover)) {
          carryoverToNextMonth += catBalance;
        } else if (catBalance < 0 && !hasCarryover) {
          overspendingThisMonth += catBalance; // keep as negative
        }
      }

      const overspendingAdjustment = overspendingFromPrevMonth;
      const monthBalance = budgeted + spent + runningBalance;

      totalBudgeted += budgeted;
      totalSpent += spent;
      totalOverspendingAdjustment += Math.abs(overspendingAdjustment);

      intervalData.push({
        date: month,
        budgeted,
        spent,
        balance: monthBalance,
        overspendingAdjustment: Math.abs(overspendingAdjustment),
      });

      runningBalance = carryoverToNextMonth;
      overspendingFromPrevMonth = overspendingThisMonth;
    }

    setData({
      intervalData,
      startDate,
      endDate,
      totalBudgeted,
      totalSpent,
      totalOverspendingAdjustment,
      finalOverspendingAdjustment: overspendingFromPrevMonth,
    });
  };
}
