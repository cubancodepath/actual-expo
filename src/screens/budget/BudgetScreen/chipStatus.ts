export type ChipStatus = "success" | "warning" | "danger" | "default";

interface ChipStatusArgs {
  /** Available (leftover) amount in cents. */
  balance: number;
  /** Assigned amount in cents. */
  budgeted: number;
  /** Goal amount in cents (0/null = no goal). */
  goal: number | null;
  /** Balance-based goal (#goal / refill) vs budgeted-based (monthly). */
  longGoal: boolean;
  /** Whether goal templates are enabled. */
  goalsEnabled: boolean;
}

/**
 * Colour of a category's Available chip, ported from Actual desktop's
 * `makeBalanceAmountStyle` (packages/desktop-client/src/components/budget/util.ts):
 * 1. negative balance → danger (always wins);
 * 2. no goal (or templates disabled) → by sign (positive = success, else neutral);
 * 3. with a goal → funded (balance/budgeted ≥ goal) = success, otherwise warning
 *    (underfunded). `longGoal` picks balance-based vs budgeted-based funding.
 */
export function categoryChipStatus({
  balance,
  budgeted,
  goal,
  longGoal,
  goalsEnabled,
}: ChipStatusArgs): ChipStatus {
  if (balance < 0) return "danger";
  if (!goalsEnabled || goal == null || goal <= 0) {
    return balance > 0 ? "success" : "default";
  }
  const funded = longGoal ? balance >= goal : budgeted >= goal;
  return funded ? "success" : "warning";
}
