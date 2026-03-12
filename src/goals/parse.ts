/**
 * Pure goal/template parsing and serialization — zero native dependencies.
 *
 * This module contains functions that work entirely in-memory:
 * parsing goal_def JSON, inferring goal values, and converting
 * templates to/from note text. Safe to import in tests without mocking.
 */

import { addMonths } from '../lib/date';
import type { Template, LimitDef } from './types';

// ---------------------------------------------------------------------------
// Parse templates from a category's goal_def
// ---------------------------------------------------------------------------

/**
 * Parse the goal_def JSON from a category.
 * Returns an empty array if goal_def is null or invalid.
 */
export function parseGoalDef(goalDef: string | null): Template[] {
  if (!goalDef) return [];
  try {
    const parsed = JSON.parse(goalDef);
    if (!Array.isArray(parsed)) return [];
    return parsed as Template[];
  } catch {
    return [];
  }
}

/**
 * Fast, synchronous goal inference from goal_def — no DB queries.
 *
 * Extracts the goal amount and longGoal flag from the primary template.
 * Works for the common types (simple, goal, by, periodic, limit).
 * Returns null for types that need DB queries (average, copy, percentage, spend)
 * or if no goal_def is set.
 *
 * For `by` templates (sinking funds), computes the monthly installment
 * when `month` is provided: (totalTarget - carryIn) / monthsRemaining.
 *
 * Used by getBudgetMonth() to fill in goal/longGoal in-memory when
 * zero_budgets doesn't have a row yet (new month, no applyGoals run).
 */
export function inferGoalFromDef(
  goalDef: string | null,
  month?: string,
  carryIn?: number,
): { goal: number; longGoal: boolean } | null {
  const templates = parseGoalDef(goalDef);
  if (templates.length === 0) return null;

  const primary = templates[0];

  switch (primary.type) {
    case 'goal':
      // #goal N — balance-based target
      return { goal: Math.round(primary.amount * 100), longGoal: true };

    case 'simple':
      // #template N — fixed monthly amount
      if (primary.monthly != null) {
        // monthly with limit: goal is the monthly amount (limit just caps budget)
        return { goal: Math.round(primary.monthly * 100), longGoal: false };
      }
      // No monthly + limit = refill (#template up to X) — balance-based target
      if (primary.limit) {
        return { goal: Math.round(primary.limit.amount * 100), longGoal: true };
      }
      return null;

    case 'by': {
      // #template N by YYYY-MM — sinking fund: compute monthly installment
      if (!month) return null;
      const totalCents = Math.round(primary.amount * 100);
      let targetMonth = primary.month;
      const period = primary.annual
        ? (primary.repeat || 1) * 12
        : primary.repeat ?? null;

      // Advance target month if it's in the past
      let numMonths = diffMonthsSync(targetMonth, month);
      while (numMonths < 0 && period) {
        targetMonth = addMonths(targetMonth, period);
        numMonths = diffMonthsSync(targetMonth, month);
      }
      if (numMonths < 0) return null; // target in the past, no repeat

      // Mirror engine's runBy: subtract carry-in (existing balance) from total
      const fromLastMonth = carryIn ?? 0;
      const needed = Math.max(0, totalCents - fromLastMonth);
      const monthlyGoal = Math.round(needed / (numMonths + 1));
      if (monthlyGoal <= 0) return null;
      return { goal: monthlyGoal, longGoal: false };
    }

    case 'spend':
      // Spend templates need DB queries for previously budgeted amounts
      return null;

    case 'periodic':
      // #template N repeat every ... — use per-occurrence amount as goal
      return { goal: Math.round(primary.amount * 100), longGoal: false };

    case 'limit':
      // Standalone limit
      return { goal: Math.round(primary.amount * 100), longGoal: false };

    case 'refill': {
      // Refill always pairs with a limit — find the companion
      const limitT = templates.find(t => t.type === 'limit');
      if (limitT) return { goal: Math.round(limitT.amount * 100), longGoal: false };
      const simpleLimit = templates.find(
        (t): t is import('./types').SimpleTemplate => t.type === 'simple' && !!t.limit,
      );
      if (simpleLimit?.limit) return { goal: Math.round(simpleLimit.limit.amount * 100), longGoal: false };
      return null;
    }

    // average, copy, percentage, remainder — need DB or context
    default:
      return null;
  }
}

/** Difference in calendar months between two "YYYY-MM" strings. */
function diffMonthsSync(to: string, from: string): number {
  const [toY, toM] = to.split('-').map(Number);
  const [fromY, fromM] = from.split('-').map(Number);
  return (toY - fromY) * 12 + (toM - fromM);
}

// ---------------------------------------------------------------------------
// Convert templates to note text (#template / #goal lines)
// ---------------------------------------------------------------------------

function limitToNote(limit: LimitDef): string {
  if (limit.period === 'daily') return ` up to ${limit.amount} per day`;
  if (limit.period === 'weekly')
    return ` up to ${limit.amount} per week${limit.start ? ` starting ${limit.start}` : ''}`;
  // monthly
  return ` up to ${limit.amount}${limit.hold ? ' hold' : ''}`;
}

function priorityPrefix(priority: number): string {
  return priority === 0 ? '#template' : `#template-${priority}`;
}

/**
 * Convert a single Template to its note-text representation.
 * For percentage templates, `categoryName` must be provided (resolved externally).
 */
export function templateToNoteLine(
  t: Template,
  categoryName?: string,
): string {
  switch (t.type) {
    case 'simple': {
      const prefix = priorityPrefix(t.priority);
      if (t.monthly != null && t.limit) return `${prefix} ${t.monthly}${limitToNote(t.limit)}`;
      if (t.monthly != null) return `${prefix} ${t.monthly}`;
      if (t.limit) return `${prefix}${limitToNote(t.limit)}`;
      return `${prefix} 0`;
    }
    case 'goal':
      return `#goal ${t.amount}`;
    case 'by': {
      const prefix = priorityPrefix(t.priority);
      let line = `${prefix} ${t.amount} by ${t.month}`;
      if (t.repeat) {
        if (t.annual) line += ` repeat every ${t.repeat === 1 ? '' : `${t.repeat} `}year${t.repeat === 1 ? '' : 's'}`;
        else line += ` repeat every ${t.repeat} months`;
      }
      return line;
    }
    case 'average': {
      const prefix = priorityPrefix(t.priority);
      let line = `${prefix} average ${t.numMonths} months`;
      if (t.adjustment && t.adjustmentType === 'percent')
        line += ` [${t.adjustment > 0 ? 'increase' : 'decrease'} ${Math.abs(t.adjustment)}%]`;
      else if (t.adjustment && t.adjustmentType === 'fixed')
        line += ` [${t.adjustment > 0 ? 'increase' : 'decrease'} ${Math.abs(t.adjustment)}]`;
      return line;
    }
    case 'copy':
      return `${priorityPrefix(t.priority)} copy from ${t.lookBack} months ago`;
    case 'periodic': {
      const prefix = priorityPrefix(t.priority);
      const pStr = t.period.amount === 1
        ? t.period.period
        : `${t.period.amount} ${t.period.period}s`;
      let line = `${prefix} ${t.amount} repeat every ${pStr}`;
      if (t.starting) line += ` starting ${t.starting}`;
      if (t.limit) line += limitToNote(t.limit);
      return line;
    }
    case 'spend': {
      const prefix = priorityPrefix(t.priority);
      let line = `${prefix} ${t.amount} by ${t.month} spend from ${t.from}`;
      if (t.repeat) {
        if (t.annual) line += ` repeat every ${t.repeat === 1 ? '' : `${t.repeat} `}year${t.repeat === 1 ? '' : 's'}`;
        else line += ` repeat every ${t.repeat} months`;
      }
      return line;
    }
    case 'percentage': {
      const prefix = priorityPrefix(t.priority);
      const prev = t.previous ? 'previous ' : '';
      const catName = t.category === 'all-income'
        ? 'all income'
        : (categoryName ?? t.category);
      return `${prefix} ${t.percent}% of ${prev}${catName}`;
    }
    case 'remainder': {
      let line = `#template remainder`;
      if (t.weight !== 1) line += ` ${t.weight}`;
      if (t.limit) line += limitToNote(t.limit);
      return line;
    }
    case 'refill':
      return `${priorityPrefix(t.priority)} refill`;
    case 'limit':
      return `#template${limitToNote({ amount: t.amount, hold: t.hold, period: t.period, start: t.start })}`;
  }
}

/**
 * Convert an array of templates to note text (one line per template).
 */
export function templatesToNoteText(
  templates: Template[],
  categoryNames?: Map<string, string>,
): string {
  return templates
    .map(t => {
      const catName = t.type === 'percentage' && t.category !== 'all-income'
        ? categoryNames?.get(t.category)
        : undefined;
      return templateToNoteLine(t, catName);
    })
    .join('\n');
}
