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
  CopyTemplate,
  GoalResult,
  LimitDef,
  LimitTemplate,
  PercentageTemplate,
  PeriodicTemplate,
  RemainderTemplate,
  RefillTemplate,
  SimpleTemplate,
  SpendTemplate,
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

/**
 * Get the budgeted amount for a category in a given month (integer cents).
 * Used by Copy and Spend templates.
 */
async function getBudgetedForMonth(
  categoryId: string,
  month: string,
): Promise<number> {
  const monthInt = monthToInt(month);
  const row = await first<{ amount: number }>(
    'SELECT COALESCE(amount, 0) AS amount FROM zero_budgets WHERE month = ? AND category = ?',
    [monthInt, categoryId],
  );
  return row?.amount ?? 0;
}

/**
 * Get total income for a month, optionally for a specific category.
 * Used by Percentage template.
 */
async function getIncomeForMonth(
  month: string,
  categoryId?: string,
): Promise<number> {
  const monthInt = monthToInt(month);
  const startDate = monthInt * 100 + 1;
  const endDate = monthInt * 100 + 31;

  if (categoryId && categoryId !== 'all-income') {
    return getSpentForMonth(categoryId, month);
  }

  // All income categories
  const row = await first<{ total: number }>(
    `SELECT COALESCE(SUM(t.amount), 0) AS total
     FROM transactions t
     LEFT JOIN category_mapping cm ON cm.id = t.category
     JOIN categories c ON c.id = COALESCE(cm.transferId, t.category) AND c.tombstone = 0
     JOIN category_groups g ON g.id = c.cat_group AND g.is_income = 1
     JOIN accounts a ON a.id = t.acct AND a.offbudget = 0
     WHERE ${ALIVE_TX_FILTER}
       AND t.date >= ? AND t.date <= ?`,
    [startDate, endDate],
  );
  return row?.total ?? 0;
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

/**
 * Convert a LimitTemplate to a LimitDef for reuse with calculateLimit.
 */
function limitTemplateToLimitDef(t: LimitTemplate): LimitDef {
  return {
    amount: t.amount,
    hold: t.hold,
    period: t.period,
    start: t.start,
  };
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

function runRefill(fromLastMonth: number, limitAmount: number): number {
  return Math.max(0, limitAmount - fromLastMonth);
}

async function runCopy(
  template: CopyTemplate,
  categoryId: string,
  month: string,
): Promise<number> {
  const pastMonth = addMonths(month, -template.lookBack);
  return getBudgetedForMonth(categoryId, pastMonth);
}

function runPeriodic(template: PeriodicTemplate, month: string): number {
  const perOccurrence = amountToInteger(template.amount);
  const { period, amount: interval } = template.period;

  // Starting date defaults to 1st of current month
  const [monthY, monthM] = month.split('-').map(Number);
  let current = template.starting
    ? new Date(template.starting)
    : new Date(monthY, monthM - 1, 1);

  const monthStart = new Date(monthY, monthM - 1, 1);
  const monthEnd = new Date(monthY, monthM, 0); // Last day of month

  // Advance starting date forward until it's in or past the current month
  while (current < monthStart) {
    current = shiftDate(current, period, interval);
  }

  // If we've gone past the current month, no occurrences
  if (current > monthEnd) return 0;

  // Count occurrences within the month
  let total = 0;
  while (current <= monthEnd) {
    total += perOccurrence;
    current = shiftDate(current, period, interval);
  }

  return total;
}

function shiftDate(
  date: Date,
  period: 'day' | 'week' | 'month' | 'year',
  amount: number,
): Date {
  const d = new Date(date);
  switch (period) {
    case 'day':
      d.setDate(d.getDate() + amount);
      break;
    case 'week':
      d.setDate(d.getDate() + amount * 7);
      break;
    case 'month':
      d.setMonth(d.getMonth() + amount);
      break;
    case 'year':
      d.setFullYear(d.getFullYear() + amount);
      break;
  }
  return d;
}

async function runSpend(
  template: SpendTemplate,
  categoryId: string,
  month: string,
): Promise<number> {
  let targetMonth = template.month;
  const period = template.annual
    ? (template.repeat || 1) * 12
    : template.repeat ?? null;

  // Advance target if it's in the past
  let numMonths = diffMonths(targetMonth, month);
  while (numMonths < 0 && period) {
    targetMonth = addMonths(targetMonth, period);
    numMonths = diffMonths(targetMonth, month);
  }

  if (numMonths < 0) return 0; // Target in the past, no repeat

  const target = amountToInteger(template.amount);

  // Sum already budgeted from start month through month before current
  let alreadyBudgeted = 0;
  let m = template.from;
  while (diffMonths(month, m) > 0) {
    alreadyBudgeted += await getBudgetedForMonth(categoryId, m);
    m = addMonths(m, 1);
  }

  const remaining = target - alreadyBudgeted;
  if (remaining <= 0) return 0;

  return Math.round(remaining / (numMonths + 1));
}

async function runPercentage(
  template: PercentageTemplate,
  month: string,
): Promise<number> {
  const incomeMonth = template.previous ? addMonths(month, -1) : month;
  const categoryId = template.category === 'all-income' ? undefined : template.category;
  const income = await getIncomeForMonth(incomeMonth, categoryId);

  // Income is positive for income categories
  return Math.max(0, Math.round(Math.abs(income) * template.percent / 100));
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
  /** Available budget for remainder distribution (set during pass 2). */
  remainderBudget?: number;
  /** Sum of all remainder weights across categories (set during pass 2). */
  totalWeight?: number;
};

// ---------------------------------------------------------------------------
// Main calculation function
// ---------------------------------------------------------------------------

// Templates that participate in priority-based processing
type PriorityTemplate =
  | SimpleTemplate
  | ByTemplate
  | AverageTemplate
  | CopyTemplate
  | PeriodicTemplate
  | SpendTemplate
  | PercentageTemplate
  | RefillTemplate;

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
  // Separate templates by type
  const goalTemplates = templates.filter(
    (t): t is import('./types').GoalTemplate => t.directive === 'goal',
  );
  const remainderTemplates = templates.filter(
    (t): t is RemainderTemplate => t.type === 'remainder',
  );
  const limitTemplates = templates.filter(
    (t): t is LimitTemplate => t.type === 'limit',
  );
  const priorityTemplates = templates.filter(
    (t): t is PriorityTemplate =>
      t.directive === 'template' &&
      t.type !== 'remainder' &&
      t.type !== 'limit',
  );

  // If only a goal directive (no budget templates), preserve existing budget
  if (
    priorityTemplates.length === 0 &&
    remainderTemplates.length === 0 &&
    goalTemplates.length > 0
  ) {
    return {
      budgeted: ctx.previouslyBudgeted,
      goal: amountToInteger(goalTemplates[0].amount),
      longGoal: true,
    };
  }

  // Handle remainder templates — signal back to apply.ts
  if (remainderTemplates.length > 0) {
    const remainder = remainderTemplates[0];

    // If remainderBudget is set, we're in pass 2 — calculate the allocation
    if (ctx.remainderBudget !== undefined && ctx.totalWeight !== undefined && ctx.totalWeight > 0) {
      let toBudget = Math.round(
        (remainder.weight / ctx.totalWeight) * ctx.remainderBudget,
      );

      // Apply limit if present
      const limitDef = remainder.limit ?? (limitTemplates.length > 0 ? limitTemplateToLimitDef(limitTemplates[0]) : null);
      if (limitDef) {
        const limitAmt = calculateLimit(limitDef, month);
        if (toBudget + ctx.fromLastMonth > limitAmt) {
          toBudget = Math.max(0, limitAmt - ctx.fromLastMonth);
        }
      }

      let goal: number | null = null;
      let longGoal = false;
      if (goalTemplates.length > 0) {
        goal = amountToInteger(goalTemplates[0].amount);
        longGoal = true;
      } else {
        goal = toBudget > 0 ? toBudget : null;
      }

      return { budgeted: toBudget, goal, longGoal };
    }

    // Pass 1 — return marker for remainder processing
    return {
      budgeted: 0,
      goal: null,
      longGoal: false,
      hasRemainder: true,
      remainderWeight: remainder.weight,
    };
  }

  // Determine limit: from LimitTemplate or SimpleTemplate.limit
  let limitAmount = 0;
  let limitCheck = false;
  if (limitTemplates.length > 0) {
    limitAmount = calculateLimit(limitTemplateToLimitDef(limitTemplates[0]), month);
    limitCheck = true;
  }
  if (!limitCheck) {
    for (const t of priorityTemplates) {
      if (t.type === 'simple' && t.limit) {
        limitAmount = calculateLimit(t.limit, month);
        limitCheck = true;
        break;
      }
      if (t.type === 'periodic' && t.limit) {
        limitAmount = calculateLimit(t.limit, month);
        limitCheck = true;
        break;
      }
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
    for (const t of priorityTemplates) {
      priorities.add(t.priority);
    }
    const sortedPriorities = [...priorities].sort((a, b) => a - b);

    for (const priority of sortedPriorities) {
      if (limitMet) break;

      const atPriority = priorityTemplates.filter(
        t => t.priority === priority,
      );
      let priorityBudget = 0;

      // Track which grouped types we've already processed at this priority
      const processed = new Set<string>();

      for (const template of atPriority) {
        if (processed.has(template.type)) continue;

        switch (template.type) {
          case 'simple':
            priorityBudget += runSimple(template, ctx.fromLastMonth, limitAmount);
            break;
          case 'refill':
            priorityBudget += runRefill(ctx.fromLastMonth, limitAmount);
            break;
          case 'copy':
            priorityBudget += await runCopy(template, categoryId, month);
            break;
          case 'periodic':
            priorityBudget += runPeriodic(template, month);
            break;
          case 'spend':
            priorityBudget += await runSpend(template, categoryId, month);
            break;
          case 'percentage':
            priorityBudget += await runPercentage(template, month);
            break;
          case 'by': {
            // Collect all By templates at this priority and run together
            const byTemplates = atPriority.filter(
              (t): t is ByTemplate => t.type === 'by',
            );
            priorityBudget += runBy(byTemplates, month, ctx.fromLastMonth);
            processed.add('by');
            break;
          }
          case 'average':
            priorityBudget += await runAverage(template, categoryId, month);
            break;
        }
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
