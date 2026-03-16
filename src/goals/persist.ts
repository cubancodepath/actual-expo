/**
 * Goal/template persistence — read/write goal_def and goal results.
 *
 * Templates are stored as a JSON array in `categories.goal_def`.
 * Goal results (computed values) are stored in `zero_budgets.goal` / `long_goal`.
 * Note text (#template / #goal lines) is written to `notes` table for
 * compatibility with the desktop Actual Budget app.
 */

import { first } from "../db";
import { sendMessages } from "../sync";
import { Timestamp } from "../crdt";
import { monthToInt } from "../lib/date";
import { updateCategory } from "../categories";
import type { Template } from "./types";
import { parseGoalDef, templatesToNoteText } from "./parse";

// ---------------------------------------------------------------------------
// Read templates from DB
// ---------------------------------------------------------------------------

/**
 * Get goal templates for a category by reading its goal_def column.
 */
export async function getGoalTemplates(categoryId: string): Promise<Template[]> {
  const row = await first<{ goal_def: string | null }>(
    "SELECT goal_def FROM categories WHERE id = ?",
    [categoryId],
  );
  return parseGoalDef(row?.goal_def ?? null);
}

// ---------------------------------------------------------------------------
// Write note text to the notes table (via CRDT)
// ---------------------------------------------------------------------------

async function setNote(entityId: string, note: string | null): Promise<void> {
  await sendMessages([
    {
      timestamp: Timestamp.send()!,
      dataset: "notes",
      row: entityId,
      column: "note",
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
    template_settings: JSON.stringify({ source: "ui" }),
  });

  // Write note text for desktop compatibility
  const noteText = templates.length > 0 ? templatesToNoteText(templates, categoryNames) : null;
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
      dataset: "zero_budgets",
      row: id,
      column: "month",
      value: monthInt,
    },
    {
      timestamp: Timestamp.send()!,
      dataset: "zero_budgets",
      row: id,
      column: "category",
      value: categoryId,
    },
    {
      timestamp: Timestamp.send()!,
      dataset: "zero_budgets",
      row: id,
      column: "goal",
      value: goal,
    },
    {
      timestamp: Timestamp.send()!,
      dataset: "zero_budgets",
      row: id,
      column: "long_goal",
      value: longGoal === true ? 1 : longGoal === false ? 0 : null,
    },
  ];

  await sendMessages(messages);
}
