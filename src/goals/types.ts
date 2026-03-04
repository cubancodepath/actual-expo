/**
 * Goal/template type definitions — compatible with Actual Budget's
 * `packages/loot-core/src/types/models/templates.ts`.
 *
 * Templates are stored as JSON arrays in `categories.goal_def`.
 * Each template has a `directive` ('template' or 'goal') and a `type`.
 */

// ---------------------------------------------------------------------------
// Limit definition (shared by Simple, Periodic, Remainder)
// ---------------------------------------------------------------------------

export type LimitDef = {
  amount: number;
  hold: boolean;
  period: 'daily' | 'weekly' | 'monthly';
  start?: string; // YYYY-MM-DD, required for weekly
};

// ---------------------------------------------------------------------------
// Template types (Phase 1: Simple, Goal, By, Average)
// ---------------------------------------------------------------------------

/** Budget a fixed amount each month, optionally with a spending limit. */
export type SimpleTemplate = {
  type: 'simple';
  monthly?: number; // amount in display units (not cents)
  limit?: LimitDef | null;
  priority: number;
  directive: 'template';
};

/** Balance target — shows goal indicator but does NOT budget anything. */
export type GoalTemplate = {
  type: 'goal';
  amount: number; // target balance in display units
  directive: 'goal';
};

/** Sinking fund — save a target amount BY a specific month. */
export type ByTemplate = {
  type: 'by';
  amount: number; // target in display units
  month: string; // YYYY-MM
  annual?: boolean;
  repeat?: number; // repeat period in months (or years if annual)
  priority: number;
  directive: 'template';
};

/** Budget based on average spending over the last N months. */
export type AverageTemplate = {
  type: 'average';
  numMonths: number;
  adjustment?: number;
  adjustmentType?: 'percent' | 'fixed';
  priority: number;
  directive: 'template';
};

// ---------------------------------------------------------------------------
// Union type
// ---------------------------------------------------------------------------

export type Template =
  | SimpleTemplate
  | GoalTemplate
  | ByTemplate
  | AverageTemplate;

// ---------------------------------------------------------------------------
// Calculation result
// ---------------------------------------------------------------------------

export type GoalResult = {
  budgeted: number; // amount to budget in cents
  goal: number | null; // goal indicator in cents
  longGoal: boolean; // true = balance-based goal (from #goal directive)
};
