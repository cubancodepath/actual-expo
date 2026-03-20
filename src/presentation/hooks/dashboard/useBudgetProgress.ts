import { useBudgetUIStore } from "@/stores/budgetUIStore";
import { useSheetValueNumber } from "../useSheetValue";
import { sheetForMonth, envelopeBudget } from "@/spreadsheet/bindings";

/**
 * Budget progress for the selected month.
 * Uses spreadsheet bindings for budgeted vs spent totals.
 */
export function useBudgetProgress() {
  const month = useBudgetUIStore((s) => s.month);
  const sheet = sheetForMonth(month);

  const totalBudgeted = useSheetValueNumber(sheet, envelopeBudget.totalBudgeted);
  const totalSpent = useSheetValueNumber(sheet, envelopeBudget.totalSpent);
  const totalIncome = useSheetValueNumber(sheet, envelopeBudget.totalIncome);
  const toBudget = useSheetValueNumber(sheet, envelopeBudget.toBudget);

  // Progress: how much of budget has been spent (0–1 scale)
  const progress = totalBudgeted !== 0 ? Math.abs(totalSpent) / Math.abs(totalBudgeted) : 0;

  return {
    totalBudgeted,
    totalSpent,
    totalIncome,
    toBudget,
    progress: Math.min(progress, 1), // cap at 1 for the gauge
    progressRaw: progress, // uncapped for overspend detection
    isLoading: false, // spreadsheet values are synchronous
  };
}
