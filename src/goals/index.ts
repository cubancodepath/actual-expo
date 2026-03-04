/**
 * Goal/template persistence — read/write goal_def and goal results.
 *
 * Templates are stored as a JSON array in `categories.goal_def`.
 * Goal results (computed values) are stored in `zero_budgets.goal` / `long_goal`.
 */

import { first } from '../db';
import { sendMessages } from '../sync';
import { Timestamp } from '../crdt';
import { monthToInt } from '../lib/date';
import { updateCategory } from '../categories';
import type { Template } from './types';

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
// Write templates to a category's goal_def (via CRDT)
// ---------------------------------------------------------------------------

/**
 * Save goal templates for a category.
 * Serializes to JSON and persists via CRDT messages for sync.
 */
export async function setGoalTemplates(
  categoryId: string,
  templates: Template[],
): Promise<void> {
  const goalDef = templates.length > 0 ? JSON.stringify(templates) : null;
  await updateCategory(categoryId, { goal_def: goalDef });
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
