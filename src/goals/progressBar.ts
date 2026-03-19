/**
 * Progress bar engine — pure, testable computation for budget category bars.
 *
 * Takes a BudgetCategory and returns numeric bar values + semantic status.
 * The UI component maps BarStatus to theme colors with a simple lookup.
 *
 * Reference: Actual Budget desktop uses 3-color text on balance
 * (green=funded, orange=underfunded, red=negative). Our progress bars
 * extend this with visual fill ratios.
 *
 * Goal semantics (from inferGoalFromDef):
 *   longGoal = true  → balance-based (savings, #goal directive, refill)
 *   longGoal = false → budgeted-based (monthly, sinking fund, limit)
 */

import { parseGoalDef } from "./parse";
import type { BudgetCategory } from "../budgets/types";
import type { Template } from "./types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BarStatus = "healthy" | "caution" | "overspent" | "neutral";

export type ProgressBarResult = {
  /** Spent portion 0-1 (darker layer in the bar). */
  spent: number;
  /** Total funded portion 0-1 (includes spent). */
  available: number;
  /** Whether the category is overspent (full red bar). */
  overspent: boolean;
  /** Whether the bar should be solid (savings) vs striped (spending). */
  striped: boolean;
  /** Semantic status for bar color. */
  barStatus: BarStatus;
  /** Semantic status for the available pill badge. */
  pillStatus: BarStatus;
};

// ---------------------------------------------------------------------------
// Goal type detection
// ---------------------------------------------------------------------------

type GoalKind = "limit" | "savings" | "sinkingFund" | "monthly" | "none";

function detectGoalKind(cat: BudgetCategory, primary: Template | undefined): GoalKind {
  const hasGoal = cat.goal != null && cat.goal > 0;
  if (!hasGoal) return "none";

  // No template parsed (spend/average/copy/percentage fall back to DB goal)
  if (!primary) return cat.longGoal ? "savings" : "monthly";

  // Spending cap: standalone limit, refill, or simple with monthly=0 + limit
  // Note: simple with monthly=null + limit is a REFILL (longGoal=true from inferGoalFromDef)
  // and is handled by the "savings" branch below via cat.longGoal check.
  if (
    primary.type === "limit" ||
    primary.type === "refill" ||
    (primary.type === "simple" && primary.monthly === 0 && !!primary.limit)
  ) {
    return "limit";
  }

  // Balance-based: #goal directive or refill-style simple (monthly=null + limit)
  if (cat.longGoal) return "savings";

  // Sinking fund (by/spend): cumulative savings toward a target
  if (primary.type === "by" || primary.type === "spend") return "sinkingFund";

  // Everything else: monthly goal (simple, periodic, average, copy, percentage, etc.)
  return "monthly";
}

function getSinkingFundTotal(primary: Template): number {
  if (primary.type === "by" || primary.type === "spend") {
    return Math.round(primary.amount * 100);
  }
  return 0;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Whether the category's goal is fully funded this month. */
export function isGoalFunded(cat: BudgetCategory): boolean {
  if (cat.goal == null || cat.goal <= 0) return false;
  return cat.longGoal ? cat.balance >= cat.goal : cat.budgeted >= cat.goal;
}

// ---------------------------------------------------------------------------
// Branch computations
// ---------------------------------------------------------------------------

const EMPTY: ProgressBarResult = {
  spent: 0,
  available: 0,
  overspent: false,
  striped: true,
  barStatus: "neutral",
  pillStatus: "neutral",
};

/**
 * Spending cap: full bar = the limit, spent portion grows as you consume.
 * Examples: `#template up to 200 per month`, standalone `#template limit`
 */
function computeLimit(cat: BudgetCategory, spentAbs: number): ProgressBarResult {
  const base = cat.goal!;
  const ratio = base > 0 ? spentAbs / base : 0;
  const overspent = ratio >= 1;
  const status: BarStatus = overspent ? "overspent" : ratio >= 0.8 ? "caution" : "healthy";
  return {
    spent: Math.min(ratio, 1),
    available: 1,
    overspent,
    striped: true,
    barStatus: status,
    pillStatus: status,
  };
}

/**
 * Balance-based savings: bar = balance / goal.
 * Examples: `#goal 1000`, `#template up to 200` (refill, monthly=null + limit)
 */
function computeSavings(cat: BudgetCategory): ProgressBarResult {
  const base = cat.goal!;
  const savedPct = Math.min(Math.max(cat.balance / base, 0), 1);
  const overspent = cat.balance < 0;
  const funded = cat.balance >= base;
  return {
    spent: savedPct,
    available: savedPct,
    overspent,
    striped: false,
    barStatus: overspent ? "overspent" : "healthy",
    pillStatus: overspent ? "overspent" : funded ? "healthy" : "caution",
  };
}

/**
 * Sinking fund: cumulative savings toward a total target.
 * Bar shows balance / totalTarget. Color based on this month's funding.
 * Examples: `#template 500 by 2026-12`, `#template 500 by 2026-12 spend from 2026-03`
 */
function computeSinkingFund(
  cat: BudgetCategory,
  primary: Template,
  spentAbs: number,
): ProgressBarResult {
  const total = getSinkingFundTotal(primary);
  if (total <= 0) return computeMonthly(cat, spentAbs);
  const savedPct = Math.min(Math.max(cat.balance / total, 0), 1);
  const overspent = cat.balance < 0;
  const funded = cat.budgeted >= cat.goal!;
  return {
    spent: savedPct,
    available: savedPct,
    overspent,
    striped: false,
    barStatus: overspent ? "overspent" : funded ? "healthy" : "caution",
    pillStatus: overspent ? "overspent" : funded ? "healthy" : "caution",
  };
}

/**
 * Monthly goal: bar shows spending progress against the goal.
 * Funded = budgeted >= goal (matches Actual desktop's indicator logic).
 * Examples: `#template 100`, `#template 50 repeat every 2 weeks`
 */
function computeMonthly(cat: BudgetCategory, spentAbs: number): ProgressBarResult {
  const base = cat.goal!;
  const overspent = cat.balance < 0;
  const funded = cat.budgeted >= base;

  // Bar shows funding progress: budgeted / goal (matches Actual desktop)
  // carryIn (positive savings or negative overspending) does NOT affect the bar.
  const fundedPct = base > 0 ? Math.min(Math.max(cat.budgeted / base, 0), 1) : 0;
  const spentPct = base > 0 ? Math.min(spentAbs / base, 1) : 0;

  return {
    spent: spentPct,
    available: fundedPct,
    overspent,
    striped: true,
    barStatus: overspent ? "overspent" : funded ? "healthy" : "caution",
    pillStatus: overspent ? "overspent" : funded ? "healthy" : "caution",
  };
}

/**
 * No goal: spending progress against budgeted amount.
 * Falls back to balance as base when no budget (carryover categories).
 */
function computeNoGoal(cat: BudgetCategory, spentAbs: number): ProgressBarResult {
  const budgetedAbs = Math.abs(cat.budgeted);
  if (budgetedAbs === 0 && cat.balance === 0) return EMPTY;

  const base = budgetedAbs > 0 ? budgetedAbs : Math.abs(cat.balance);
  const overspent = cat.balance < 0;

  return {
    spent: base > 0 ? Math.min(spentAbs / base, 1) : 0,
    available: base > 0 ? Math.min(Math.max((spentAbs + cat.balance) / base, 0), 1) : 0,
    overspent,
    striped: true,
    barStatus: overspent ? "overspent" : cat.balance > 0 ? "healthy" : "neutral",
    pillStatus: overspent ? "overspent" : cat.balance > 0 ? "healthy" : "neutral",
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export function computeProgressBar(cat: BudgetCategory): ProgressBarResult {
  const templates = parseGoalDef(cat.goalDef);
  const primary = templates[0];
  const kind = detectGoalKind(cat, primary);
  const spentAbs = Math.abs(cat.spent);

  switch (kind) {
    case "limit":
      return computeLimit(cat, spentAbs);
    case "savings":
      return computeSavings(cat);
    case "sinkingFund":
      return computeSinkingFund(cat, primary!, spentAbs);
    case "monthly":
      return computeMonthly(cat, spentAbs);
    case "none":
      return computeNoGoal(cat, spentAbs);
  }
}
