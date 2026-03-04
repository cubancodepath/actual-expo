/**
 * Goal/template calculation engine.
 *
 * Mirrors the logic from Actual Budget's `category-template-context.ts`.
 * All monetary values in this module are in **integer cents** unless
 * noted otherwise (template definition amounts are in display units).
 */

import { first, runQuery } from '../db';
import { addMonths, monthToInt } from '../lib/date';
import type {
  AverageTemplate,
  ByTemplate,
  GoalResult,
  LimitDef,
  SimpleTemplate,
  Template,
} from './types';

// ---------------------------------------------------------------------------
// Amount conversion helpers (display units ↔ integer cents)
// ---------------------------------------------------------------------------

/** Convert a user-facing amount (e.g. 12.50) to integer cents (1250). */
export function amountToInteger(amount: number): number {
  return Math.round(amount * 100);
}

/** Convert integer cents to a display amount. */
export function integerToAmount(amount: number): number {
  return amount / 100;
}

// ---------------------------------------------------------------------------
// Transaction filter (same as budgets/index.ts)
// ---------------------------------------------------------------------------

const ALIVE_TX_FILTER = `
  t.tombstone = 0
  AND t.isParent = 0
  AND t.date IS NOT NULL
  AND t.acct IS NOT NULL
  AND (t.isChild = 0 OR NOT EXISTS (
    SELECT 1 FROM transactions t2 WHERE t2.id = t.parent_id AND t2.tombstone = 1
  ))`;

// ---------------------------------------------------------------------------
// Data query helpers
// ---------------------------------------------------------------------------

/**
 * Get total spent for a category in a given month (returns negative cents
 * for expenses, positive for income — same as transaction amounts).
 */
export async function getSpentForMonth(
  categoryId: string,
  month: string,
): Promise<number> {
  const monthInt = monthToInt(month);
  const startDate = monthInt * 100 + 1;
  const endDate = monthInt * 100 + 31;

  const row = await first<{ spent: number }>(
    `SELECT COALESCE(SUM(t.amount), 0) AS spent
     FROM transactions t
     LEFT JOIN category_mapping cm ON cm.id = t.category
     JOIN accounts a ON a.id = t.acct AND a.offbudget = 0
     WHERE ${ALIVE_TX_FILTER}
       AND COALESCE(cm.transferId, t.category) = ?
       AND t.date >= ? AND t.date <= ?`,
    [categoryId, startDate, endDate],
  );
  return row?.spent ?? 0;
}

// ---------------------------------------------------------------------------
// Difference in calendar months between two "YYYY-MM" strings
// ---------------------------------------------------------------------------

function diffMonths(to: string, from: string): number {
  const [toY, toM] = to.split('-').map(Number);
  const [fromY, fromM] = from.split('-').map(Number);
  return (toY - fromY) * 12 + (toM - fromM);
}

// ---------------------------------------------------------------------------
// Limit calculation
// ---------------------------------------------------------------------------

function calculateLimit(limit: LimitDef, month: string): number {
  if (limit.period === 'monthly') {
    return amountToInteger(limit.amount);
  }

  if (limit.period === 'daily') {
    // Days in this month
    const [y, m] = month.split('-').map(Number);
    const numDays = new Date(y, m, 0).getDate();
    return amountToInteger(limit.amount) * numDays;
  }

  if (limit.period === 'weekly') {
    if (!limit.start) {
      throw new Error('Weekly limit requires a start date (YYYY-MM-DD)');
    }
    const nextMonth = addMonths(month, 1);
    const baseLimit = amountToInteger(limit.amount);
    let week = limit.start;
    let total = 0;

    // Advance start until it's at or past the current month
    while (week < month) {
      const d = new Date(week);
      d.setDate(d.getDate() + 7);
      week = d.toISOString().slice(0, 10);
    }

    // Count weeks within this month
    while (week < `${nextMonth}-01`) {
      if (week >= `${month}-01`) {
        total += baseLimit;
      }
      const d = new Date(week);
      d.setDate(d.getDate() + 7);
      week = d.toISOString().slice(0, 10);
    }
    return total;
  }

  throw new Error(`Invalid limit period: ${limit.period}`);
}

// ---------------------------------------------------------------------------
// Individual template runners
// ---------------------------------------------------------------------------

function runSimple(
  template: SimpleTemplate,
  fromLastMonth: number,
  limitAmount: number,
): number {
  if (template.monthly != null) {
    return amountToInteger(template.monthly);
  }
  // Refill mode: budget up to limit
  return Math.max(0, limitAmount - fromLastMonth);
}

function runBy(
  templates: ByTemplate[],
  month: string,
  fromLastMonth: number,
): number {
  if (templates.length === 0) return 0;

  const savedInfo: { numMonths: number; period: number | null }[] = [];
  let totalNeeded = 0;
  let shortestNumMonths: number | undefined;

  // Find shortest time period across all By templates
  for (const template of templates) {
    let targetMonth = template.month;
    const period = template.annual
      ? (template.repeat || 1) * 12
      : template.repeat ?? null;

    let numMonths = diffMonths(targetMonth, month);
    while (numMonths < 0 && period) {
      targetMonth = addMonths(targetMonth, period);
      numMonths = diffMonths(targetMonth, month);
    }

    savedInfo.push({ numMonths, period });
    if (shortestNumMonths === undefined || numMonths < shortestNumMonths) {
      shortestNumMonths = numMonths;
    }
  }

  const shortNum = shortestNumMonths ?? 0;

  // Calculate needed funds per template
  for (let i = 0; i < templates.length; i++) {
    const template = templates[i];
    const { numMonths, period } = savedInfo[i];
    let amount: number;

    if (numMonths > shortNum && period) {
      // Back-interpolate what's needed in the short window
      amount = Math.round(
        (amountToInteger(template.amount) / period) *
          (period - numMonths + shortNum),
      );
    } else if (numMonths > shortNum) {
      amount = Math.round(
        (amountToInteger(template.amount) / (numMonths + 1)) * (shortNum + 1),
      );
    } else {
      amount = amountToInteger(template.amount);
    }
    totalNeeded += amount;
  }

  return Math.round((totalNeeded - fromLastMonth) / (shortNum + 1));
}

async function runAverage(
  template: AverageTemplate,
  categoryId: string,
  month: string,
): Promise<number> {
  let sum = 0;
  for (let i = 1; i <= template.numMonths; i++) {
    const prevMonth = addMonths(month, -i);
    sum += await getSpentForMonth(categoryId, prevMonth);
  }

  // Negate — spending is negative in the DB, we want a positive budget amount
  let average = -(sum / template.numMonths);

  if (template.adjustment !== undefined && template.adjustmentType) {
    if (template.adjustmentType === 'percent') {
      average = average * (1 + template.adjustment / 100);
    } else if (template.adjustmentType === 'fixed') {
      average += amountToInteger(template.adjustment);
    }
  }

  return Math.round(average);
}

// ---------------------------------------------------------------------------
// Context for calculating a single category's goals
// ---------------------------------------------------------------------------

export type GoalContext = {
  /** Balance carried from previous month (integer cents). */
  fromLastMonth: number;
  /** Amount already budgeted this month (integer cents). */
  previouslyBudgeted: number;
};

// ---------------------------------------------------------------------------
// Main calculation function
// ---------------------------------------------------------------------------

/**
 * Calculate the goal result for a single category.
 *
 * @param categoryId   The category ID
 * @param month        Target month ("YYYY-MM")
 * @param templates    Parsed templates from goal_def
 * @param ctx          Context with fromLastMonth and previouslyBudgeted
 * @returns            GoalResult with budgeted amount, goal, and longGoal flag
 */
export async function calculateGoal(
  categoryId: string,
  month: string,
  templates: Template[],
  ctx: GoalContext,
): Promise<GoalResult> {
  // Separate templates by directive
  const budgetTemplates = templates.filter(
    (t): t is SimpleTemplate | ByTemplate | AverageTemplate =>
      t.directive === 'template',
  );
  const goalTemplates = templates.filter(
    (t): t is import('./types').GoalTemplate => t.directive === 'goal',
  );

  // If only a goal directive (no budget templates), preserve existing budget
  if (budgetTemplates.length === 0 && goalTemplates.length > 0) {
    return {
      budgeted: ctx.previouslyBudgeted,
      goal: amountToInteger(goalTemplates[0].amount),
      longGoal: true,
    };
  }

  // Calculate limit if any Simple template has one
  let limitAmount = 0;
  let limitCheck = false;
  for (const t of budgetTemplates) {
    if (t.type === 'simple' && t.limit) {
      limitAmount = calculateLimit(t.limit, month);
      limitCheck = true;
      break; // Only one limit per category
    }
  }

  // Check if limit is already met
  let limitMet = false;
  let toBudget = 0;

  if (limitCheck && ctx.fromLastMonth >= limitAmount) {
    limitMet = true;
    toBudget = 0;
  }

  if (!limitMet) {
    // Group by priority, process lowest first
    const priorities = new Set<number>();
    for (const t of budgetTemplates) {
      priorities.add(t.priority);
    }
    const sortedPriorities = [...priorities].sort((a, b) => a - b);

    for (const priority of sortedPriorities) {
      if (limitMet) break;

      const priorityTemplates = budgetTemplates.filter(
        t => t.priority === priority,
      );
      let priorityBudget = 0;

      for (const template of priorityTemplates) {
        switch (template.type) {
          case 'simple':
            priorityBudget += runSimple(template, ctx.fromLastMonth, limitAmount);
            break;
          case 'by':
            // Collect all By templates at this priority and run together
            priorityBudget += runBy(
              priorityTemplates.filter((t): t is ByTemplate => t.type === 'by'),
              month,
              ctx.fromLastMonth,
            );
            // Skip remaining By templates at this priority (already processed)
            break;
          case 'average':
            priorityBudget += await runAverage(template, categoryId, month);
            break;
        }

        // Only process By once per priority level
        if (template.type === 'by') break;
      }

      // Apply limit cap
      if (limitCheck) {
        if (toBudget + priorityBudget + ctx.fromLastMonth >= limitAmount) {
          priorityBudget = limitAmount - toBudget - ctx.fromLastMonth;
          limitMet = true;
        }
      }

      toBudget += priorityBudget;
    }
  }

  // Determine goal value
  let goal: number | null = null;
  let longGoal = false;

  if (goalTemplates.length > 0) {
    // Explicit #goal directive overrides
    goal = amountToInteger(goalTemplates[0].amount);
    longGoal = true;
  } else {
    // Goal = the full amount templates requested (for progress indicator)
    goal = toBudget > 0 ? toBudget : null;
  }

  return { budgeted: toBudget, goal, longGoal };
}
