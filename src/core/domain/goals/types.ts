/**
 * Goal/template type definitions — compatible with Actual Budget's
 * `packages/loot-core/src/types/models/templates.ts`.
 *
 * Templates are stored as JSON arrays in `categories.goal_def`.
 * Each template has a `directive` ('template' or 'goal') and a `type`.
 */

// ---------------------------------------------------------------------------
// Limit definition (shared by Simple, Periodic, Remainder, Limit)
// ---------------------------------------------------------------------------

export type LimitDef = {
  amount: number;
  hold: boolean;
  period: "daily" | "weekly" | "monthly";
  start?: string; // YYYY-MM-DD, required for weekly
};

// ---------------------------------------------------------------------------
// Template types
// ---------------------------------------------------------------------------

/** Budget a fixed amount each month, optionally with a spending limit. */
export type SimpleTemplate = {
  type: "simple";
  monthly?: number; // amount in display units (not cents)
  limit?: LimitDef | null;
  priority: number;
  directive: "template";
};

/** Balance target — shows goal indicator but does NOT budget anything. */
export type GoalTemplate = {
  type: "goal";
  amount: number; // target balance in display units
  directive: "goal";
};

/** Sinking fund — save a target amount BY a specific month. */
export type ByTemplate = {
  type: "by";
  amount: number; // target in display units
  month: string; // YYYY-MM
  annual?: boolean;
  repeat?: number; // repeat period in months (or years if annual)
  priority: number;
  directive: "template";
};

/** Budget based on average spending over the last N months. */
export type AverageTemplate = {
  type: "average";
  numMonths: number;
  adjustment?: number;
  adjustmentType?: "percent" | "fixed";
  priority: number;
  directive: "template";
};

/** Copy budget from N months ago. */
export type CopyTemplate = {
  type: "copy";
  lookBack: number;
  priority: number;
  directive: "template";
};

/** Budget based on recurring periodic occurrences within the month. */
export type PeriodicTemplate = {
  type: "periodic";
  amount: number; // per-occurrence amount in display units
  period: { period: "day" | "week" | "month" | "year"; amount: number };
  starting?: string; // YYYY-MM-DD
  limit?: LimitDef | null;
  priority: number;
  directive: "template";
};

/** Distribute a target amount across a date range (from → month). */
export type SpendTemplate = {
  type: "spend";
  amount: number; // target in display units
  month: string; // YYYY-MM target month
  from: string; // YYYY-MM start month
  annual?: boolean;
  repeat?: number;
  priority: number;
  directive: "template";
};

/** Budget a percentage of income (all or specific category). */
export type PercentageTemplate = {
  type: "percentage";
  percent: number; // 0–100
  previous: boolean; // use previous month's income
  category: string; // category ID or 'all-income'
  priority: number;
  directive: "template";
};

/** Distribute remaining budget by weight (processed AFTER priority templates). */
export type RemainderTemplate = {
  type: "remainder";
  weight: number;
  limit?: LimitDef | null;
  directive: "template";
  // No priority — processed post-priority
};

/** Refill category balance back to its limit amount. */
export type RefillTemplate = {
  type: "refill";
  priority: number;
  directive: "template";
};

/** Standalone spending limit — caps budget from other templates. */
export type LimitTemplate = {
  type: "limit";
  amount: number; // display units
  hold: boolean;
  period: "daily" | "weekly" | "monthly";
  start?: string; // YYYY-MM-DD, for weekly
  directive: "template";
  // No priority — limit enforcement, not budgeting
};

// ---------------------------------------------------------------------------
// Union type
// ---------------------------------------------------------------------------

export type Template =
  | SimpleTemplate
  | GoalTemplate
  | ByTemplate
  | AverageTemplate
  | CopyTemplate
  | PeriodicTemplate
  | SpendTemplate
  | PercentageTemplate
  | RemainderTemplate
  | RefillTemplate
  | LimitTemplate;

// ---------------------------------------------------------------------------
// Calculation result
// ---------------------------------------------------------------------------

export type GoalResult = {
  budgeted: number; // amount to budget in cents
  goal: number | null; // goal indicator in cents
  longGoal: boolean; // true = balance-based goal (from #goal directive)
  hasRemainder?: boolean; // true if category uses remainder template
  remainderWeight?: number; // weight for remainder distribution
};
