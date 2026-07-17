/**
 * Goal/template persistence — read/write goal_def and goal results.
 *
 * Templates are stored as a JSON array in `categories.goal_def`.
 * Goal results (computed values) are stored in `zero_budgets.goal` / `long_goal`.
 * Note text (#template / #goal lines) is written to `notes` table for
 * compatibility with the desktop Actual Budget app.
 */

import { first } from "@/core/db";
import { sendMessages } from "@/core/sync";
import { Timestamp } from "@/core/crdt";
import { monthToInt } from "@/lib/date";
import { updateCategory } from "../categories";
import type { Template } from "./types";
import { parseGoalDef, stripTemplateLines, templatesToNoteText } from "./parse";

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

/**
 * Get a category's note text.
 *
 * Read path for the legacy notes-based template format: a budget authored on
 * desktop before the goal_def UI existed keeps its templates as #template
 * lines here, with no goal_def to read.
 */
export async function getCategoryNote(categoryId: string): Promise<string | null> {
  const row = await first<{ note: string | null }>("SELECT note FROM notes WHERE id = ?", [
    categoryId,
  ]);
  return row?.note ?? null;
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
 *
 * The notes field is shared with the user's own text about the category, so
 * only the #template/#goal lines are rewritten — any other line (plain notes,
 * or directives this app doesn't manage such as #cleanup) is kept verbatim.
 *
 * @param categoryNameToId Reverse of `categoryNames`, used to recognize
 *   percentage lines by category name when stripping the old mirror. Without
 *   it an existing "#template 10% of Salary" line is treated as plain text
 *   and would survive alongside its own replacement.
 */
export async function setGoalTemplates(
  categoryId: string,
  templates: Template[],
  categoryNames?: Map<string, string>,
  categoryNameToId?: Map<string, string>,
): Promise<void> {
  const goalDef = templates.length > 0 ? JSON.stringify(templates) : null;
  await updateCategory(categoryId, {
    goal_def: goalDef,
    template_settings: JSON.stringify({ source: "ui" }),
  });

  // Rewrite the note mirror for desktop compatibility, keeping user text
  const existing = await getCategoryNote(categoryId);
  const preserved = stripTemplateLines(existing, categoryNameToId);
  const mirror = templates.length > 0 ? templatesToNoteText(templates, categoryNames) : "";
  const noteText = [preserved, mirror].filter(Boolean).join("\n");
  await setNote(categoryId, noteText || null);
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
