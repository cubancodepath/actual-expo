/**
 * Goal/template persistence — read/write goal_def and goal results.
 *
 * Templates are stored as a JSON array in `categories.goal_def`.
 * Goal results (computed values) are stored in `zero_budgets.goal` / `long_goal`.
 * Note text (#template / #goal lines) is written to `notes` table for
 * compatibility with the desktop Actual Budget app.
 */

import { first } from '../db';
import { sendMessages } from '../sync';
import { Timestamp } from '../crdt';
import { monthToInt } from '../lib/date';
import { updateCategory } from '../categories';
import type { Template, LimitDef } from './types';

// ---------------------------------------------------------------------------
// Read templates from a category's goal_def
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
 * Get goal templates for a category by reading its goal_def column.
 */
export async function getGoalTemplates(
  categoryId: string,
): Promise<Template[]> {
  const row = await first<{ goal_def: string | null }>(
    'SELECT goal_def FROM categories WHERE id = ?',
    [categoryId],
  );
  return parseGoalDef(row?.goal_def ?? null);
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

// ---------------------------------------------------------------------------
// Write note text to the notes table (via CRDT)
// ---------------------------------------------------------------------------

async function setNote(entityId: string, note: string | null): Promise<void> {
  await sendMessages([
    {
      timestamp: Timestamp.send()!,
      dataset: 'notes',
      row: entityId,
      column: 'note',
      value: note,
    },
  ]);
}

// ---------------------------------------------------------------------------
// Write templates to a category's goal_def (via CRDT)
// ---------------------------------------------------------------------------

/**
 * Save goal templates for a category.
 * Serializes to JSON and persists via CRDT messages for sync.
 * Also writes #template/#goal note text to the notes table for
 * compatibility with the desktop Actual Budget app.
 */
export async function setGoalTemplates(
  categoryId: string,
  templates: Template[],
  categoryNames?: Map<string, string>,
): Promise<void> {
  const goalDef = templates.length > 0 ? JSON.stringify(templates) : null;
  await updateCategory(categoryId, {
    goal_def: goalDef,
    template_settings: JSON.stringify({ source: 'ui' }),
  });

  // Write note text for desktop compatibility
  const noteText = templates.length > 0
    ? templatesToNoteText(templates, categoryNames)
    : null;
  await setNote(categoryId, noteText);
}

// ---------------------------------------------------------------------------
// Write goal results to zero_budgets (via CRDT)
// ---------------------------------------------------------------------------

/**
 * Save computed goal values for a category+month in zero_budgets.
 * Creates the row if it doesn't exist.
 */
export async function setGoalResult(
  month: string,
  categoryId: string,
  goal: number | null,
  longGoal: boolean | null,
): Promise<void> {
  const monthInt = monthToInt(month);
  const id = `${monthInt}-${categoryId}`;

  const messages = [
    {
      timestamp: Timestamp.send()!,
      dataset: 'zero_budgets',
      row: id,
      column: 'month',
      value: monthInt,
    },
    {
      timestamp: Timestamp.send()!,
      dataset: 'zero_budgets',
      row: id,
      column: 'category',
      value: categoryId,
    },
    {
      timestamp: Timestamp.send()!,
      dataset: 'zero_budgets',
      row: id,
      column: 'goal',
      value: goal,
    },
    {
      timestamp: Timestamp.send()!,
      dataset: 'zero_budgets',
      row: id,
      column: 'long_goal',
      value: longGoal === true ? 1 : longGoal === false ? 0 : null,
    },
  ];

  await sendMessages(messages);
}
