/**
 * Goal/template persistence — read/write goal_def and goal results.
 *
 * Templates are stored as a JSON array in `categories.goal_def`.
 * Goal results (computed values) are stored in `zero_budgets.goal` / `long_goal`.
 * Note text (#template / #goal lines) is written to `notes` table for
 * compatibility with the desktop Actual Budget app.
 */

import { first } from "@/core/db";
import { updateCategory } from "../categories";
import type { Template } from "@/core/types/models";
import { parseGoalDef } from "./parse";

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
// Write templates to a category's goal_def (via CRDT)
// ---------------------------------------------------------------------------

/**
 * Save goal templates for a category.
 *
 * Serializes to `goal_def` JSON and marks `template_settings.source = "ui"`,
 * mirroring upstream Actual's `storeTemplates({ source: "ui" })`. The category
 * note is deliberately left untouched: notes are a separate, user-owned entity,
 * and the goal engine reads `goal_def` (the `#template`/`#goal` note format is
 * only a legacy input parsed as a fallback when `goal_def` is empty).
 */
export async function setGoalTemplates(categoryId: string, templates: Template[]): Promise<void> {
  const goalDef = templates.length > 0 ? JSON.stringify(templates) : null;
  await updateCategory(categoryId, {
    goal_def: goalDef,
    template_settings: JSON.stringify({ source: "ui" }),
  });
}

// ---------------------------------------------------------------------------
// Write goal results to zero_budgets (via CRDT)
// ---------------------------------------------------------------------------

/**
 * Save computed goal values for a category+month. Delegates to the type-aware
 * setBudgetGoal (writes zero_budgets or reflect_budgets per budgetType),
 * deduplicating what used to be a hardcoded zero_budgets writer. Dynamic import
 * avoids a static goals↔budgets import cycle.
 */
export async function setGoalResult(
  month: string,
  categoryId: string,
  goal: number | null,
  longGoal: boolean | null,
): Promise<void> {
  const { setBudgetGoal } = await import("../budgets");
  await setBudgetGoal(month, categoryId, goal, longGoal);
}
