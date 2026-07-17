/**
 * Automation entries — the editable, UI-facing shape of goal templates.
 *
 * A category's `goal_def` is a flat `Template[]`, but several raw template
 * types are two things at once (a `simple` template carries both a monthly
 * contribution and a spending limit) and several map onto one editor
 * ("average" and "copy" are both "from history"). This module converts
 * between the stored array and a list of entries the UI can show one row
 * each, mirroring the desktop client's Budget Automations editor
 * (`packages/desktop-client/src/components/modals/BudgetAutomationsModal/`
 * and `components/budget/goals/`).
 *
 * Pure — no native or React dependencies, safe to unit test in Node.
 */

import { addMonths, currentMonth } from "@/lib/date";
import type {
  AverageTemplate,
  ByTemplate,
  CopyTemplate,
  GoalTemplate,
  LimitTemplate,
  PercentageTemplate,
  PeriodicTemplate,
  RefillTemplate,
  RemainderTemplate,
  ScheduleTemplate,
  SpendTemplate,
  Template,
} from "./types";

// ---------------------------------------------------------------------------
// Display types
// ---------------------------------------------------------------------------

export const displayTemplateTypes = [
  "fixed",
  "schedule",
  "percentage",
  "historical",
  "limit",
  "refill",
  "remainder",
  "goal",
] as const;

export type DisplayTemplateType = (typeof displayTemplateTypes)[number];

/** Types that never contribute money — they cap or observe other templates. */
export const NON_CONTRIBUTION_TYPES: ReadonlySet<DisplayTemplateType> = new Set(["limit", "goal"]);

/** Types a category may only have one of. */
export const SINGLETON_TYPES: ReadonlySet<DisplayTemplateType> = new Set([
  "limit",
  "refill",
  "remainder",
  "goal",
]);

export type AutomationEntry = {
  /** Ephemeral UI key — not persisted; dropped by entriesToTemplates(). */
  id: string;
  displayType: DisplayTemplateType;
  template: Template;
};

let entrySeq = 0;

export function createAutomationEntry(
  template: Template,
  displayType: DisplayTemplateType,
): AutomationEntry {
  entrySeq += 1;
  return { id: `automation-${entrySeq}`, displayType, template };
}

export function toDisplayType(template: Template): DisplayTemplateType {
  switch (template.type) {
    case "percentage":
      return "percentage";
    case "schedule":
      return "schedule";
    case "periodic":
    case "simple":
      return "fixed";
    case "limit":
      return "limit";
    case "refill":
      return "refill";
    case "average":
    case "copy":
      return "historical";
    case "by":
    case "spend":
      // Every date-targeted shape is the fixed editor's: a plain annual
      // repeat is its Yearly preset, and the rest (one shot, every N months,
      // spending windows) are Custom modes.
      return "fixed";
    case "remainder":
      return "remainder";
    case "goal":
      return "goal";
  }
}

// ---------------------------------------------------------------------------
// Schedule hydration
// ---------------------------------------------------------------------------

export type ScheduleRef = { id: string; name?: string | null };

/**
 * Fill in scheduleId from name (or refresh a stale name from scheduleId) so
 * the editor and the engine consistently see both.
 */
export function hydrateScheduleTemplate(
  template: ScheduleTemplate,
  schedules: readonly ScheduleRef[],
): ScheduleTemplate {
  const schedule = template.scheduleId
    ? schedules.find((s) => s.id === template.scheduleId)
    : template.name
      ? schedules.find((s) => s.name?.trim() === template.name?.trim())
      : undefined;
  if (!schedule) return template;
  return { ...template, scheduleId: schedule.id, name: schedule.name ?? template.name };
}

// ---------------------------------------------------------------------------
// Template[] → AutomationEntry[]
// ---------------------------------------------------------------------------

function limitTemplateFrom(limit: NonNullable<PeriodicTemplate["limit"]>): LimitTemplate {
  return {
    type: "limit",
    amount: limit.amount,
    hold: limit.hold,
    period: limit.period,
    start: limit.start,
    directive: "template",
  };
}

/**
 * Expand a stored `Template[]` into one entry per editable row.
 *
 * Splits the compound shapes that hold two ideas at once:
 * - `simple { monthly, limit }` → a fixed contribution entry + a limit entry
 * - `periodic`/`remainder` carrying a `limit` → the base entry + a limit entry
 *
 * And fuses the shape that is one idea told twice: desktop writes "refill up
 * to X" as a `limit` plus a `refill` template, which the engine runs with the
 * very same expression as a lone `simple { limit }` (`runRefill` and
 * `runSimple`'s refill branch are both `max(0, limit - carried)`). It becomes
 * one fixed entry in refill mode — one row, editable whole. Saving writes the
 * `simple { limit }` form back, which desktop re-splits into its own pair.
 *
 * `simple` contributions are canonicalized to `periodic { month, 1 }`, which
 * is what the desktop editor writes back, so a category edited on either
 * client round-trips to the same JSON.
 */
export function templatesToEntries(
  templates: readonly Template[],
  schedules: readonly ScheduleRef[] = [],
): AutomationEntry[] {
  const entries: AutomationEntry[] = [];

  // A refill only means "top up to the cap" — it needs the cap to say how far,
  // so the two are one goal. Fuse them, and skip the limit when we reach it.
  const refill = templates.find((t) => t.type === "refill");
  const cap = refill ? templates.find((t) => t.type === "limit") : undefined;

  for (const template of templates) {
    if (template.type === "schedule") {
      entries.push(createAutomationEntry(hydrateScheduleTemplate(template, schedules), "schedule"));
      continue;
    }

    if (cap && template.type === "refill") {
      entries.push(
        createAutomationEntry(
          {
            type: "simple",
            limit: { amount: cap.amount, hold: cap.hold, period: cap.period, start: cap.start },
            priority: template.priority,
            directive: "template",
          },
          "fixed",
        ),
      );
      continue;
    }
    // Its cap is now part of the fused entry above.
    if (cap && template === cap) continue;

    if (template.type === "simple") {
      const monthly = template.monthly;
      const hasMonthly = monthly != null && monthly !== 0;

      // Refill-to-cap: one fixed entry, edited whole.
      if (template.limit && monthly == null) {
        entries.push(createAutomationEntry(template, "fixed"));
        continue;
      }

      if (template.limit) {
        entries.push(createAutomationEntry(limitTemplateFrom(template.limit), "limit"));
      }

      const contribution = hasMonthly || (monthly === 0 && template.limit == null) ? monthly : null;
      if (contribution != null) {
        entries.push(
          createAutomationEntry(
            {
              type: "periodic",
              amount: contribution,
              period: { period: "month", amount: 1 },
              starting: `${currentMonth()}-01`,
              priority: template.priority,
              directive: "template",
            },
            "fixed",
          ),
        );
      }

      // A simple template with neither monthly nor limit budgets nothing —
      // drop it rather than keep a row that has no fields to edit.
      continue;
    }

    if ((template.type === "periodic" || template.type === "remainder") && template.limit) {
      const { limit, ...base } = template;
      entries.push(createAutomationEntry(base, toDisplayType(base)));
      entries.push(createAutomationEntry(limitTemplateFrom(limit), "limit"));
      continue;
    }

    entries.push(createAutomationEntry(template, toDisplayType(template)));
  }

  return entries;
}

// ---------------------------------------------------------------------------
// AutomationEntry[] → Template[]
// ---------------------------------------------------------------------------

function hasPriority(
  t: Template,
): t is Exclude<Template, LimitTemplate | RemainderTemplate | GoalTemplate> {
  return t.type !== "limit" && t.type !== "remainder" && t.type !== "goal";
}

/**
 * Flatten entries back to the stored `Template[]`.
 *
 * List order is the priority: the first contributing entry runs first. The
 * engine (mirroring loot-core's `CategoryTemplateContext`) additionally
 * requires every `schedule` and `by` template in a category to share a single
 * priority — if they don't, none of them budget at all. Rather than expose
 * that rule as a user-facing constraint, all schedule/by templates are pinned
 * to the priority of whichever of them comes first in the list.
 */
export function entriesToTemplates(entries: readonly AutomationEntry[]): Template[] {
  const templates = entries.map((e) => e.template);

  let priority = 0;
  const withPriorities = templates.map((t) =>
    hasPriority(t) ? { ...t, priority: priority++ } : t,
  );

  const firstScheduleOrBy = withPriorities.find((t) => t.type === "schedule" || t.type === "by");
  if (firstScheduleOrBy && hasPriority(firstScheduleOrBy)) {
    const shared = firstScheduleOrBy.priority;
    return withPriorities.map((t) =>
      t.type === "schedule" || t.type === "by" ? { ...t, priority: shared } : t,
    );
  }

  return withPriorities;
}

// ---------------------------------------------------------------------------
// Defaults for newly added automations
// ---------------------------------------------------------------------------

/**
 * A blank template of the given display type. Amounts start at 0 so the
 * amount keypad opens empty; dates default far enough out that a freshly
 * created goal isn't already in the past.
 */
export function createDefaultTemplate(displayType: DisplayTemplateType): Template {
  switch (displayType) {
    case "fixed":
      return {
        type: "periodic",
        amount: 0,
        period: { period: "month", amount: 1 },
        starting: `${currentMonth()}-01`,
        priority: 0,
        directive: "template",
      } satisfies PeriodicTemplate;
    case "schedule":
      return {
        type: "schedule",
        name: "",
        priority: 0,
        directive: "template",
      } satisfies ScheduleTemplate;
    case "percentage":
      return {
        type: "percentage",
        percent: 10,
        previous: false,
        category: "all-income",
        priority: 0,
        directive: "template",
      } satisfies PercentageTemplate;
    case "historical":
      return {
        type: "average",
        numMonths: 3,
        priority: 0,
        directive: "template",
      } satisfies AverageTemplate;
    case "limit":
      return {
        type: "limit",
        amount: 0,
        hold: false,
        period: "monthly",
        directive: "template",
      } satisfies LimitTemplate;
    case "refill":
      return { type: "refill", priority: 0, directive: "template" } satisfies RefillTemplate;
    case "remainder":
      return { type: "remainder", weight: 1, directive: "template" } satisfies RemainderTemplate;
    case "goal":
      return { type: "goal", amount: 0, directive: "goal" } satisfies GoalTemplate;
  }
}

// ---------------------------------------------------------------------------
// Recurrence segment (Weekly / Monthly / Yearly / Custom)
// ---------------------------------------------------------------------------

export type RecurrenceSegment = "weekly" | "monthly" | "yearly" | "custom";

/**
 * Which segment a fixed-amount template reads as, or null if the template
 * isn't a fixed-amount one. "Every 1 week/month" are presets, an annual
 * by-date is Yearly, refill caps follow their limit's period; any other
 * periodic cadence (every N, daily) is Custom. Legacy `simple` templates are
 * monthly by definition.
 */
export function segmentFromTemplate(template: Template): RecurrenceSegment | null {
  if (template.type === "simple") {
    return template.limit?.period === "weekly" ? "weekly" : "monthly";
  }
  if (template.type === "spend") return "custom";
  if (template.type === "by") {
    // A plain annual repeat is the Yearly preset; any other by-date (one
    // shot, every N months/years) is Custom.
    return template.annual && (template.repeat ?? 1) === 1 ? "yearly" : "custom";
  }
  if (template.type !== "periodic") return null;

  const { period, amount } = template.period;
  if (amount !== 1) return "custom";
  switch (period) {
    case "week":
      return "weekly";
    case "month":
      return "monthly";
    case "year":
      return "yearly";
    default:
      return "custom";
  }
}

/**
 * Apply a preset segment to a fixed-amount template. "Custom" leaves the
 * period untouched — the editor exposes the interval and unit directly for
 * the user to change from wherever they were.
 */
export function applySegment(
  template: PeriodicTemplate,
  segment: RecurrenceSegment,
): PeriodicTemplate {
  switch (segment) {
    case "weekly":
      return { ...template, period: { period: "week", amount: 1 } };
    case "monthly":
      return { ...template, period: { period: "month", amount: 1 } };
    case "yearly":
      return { ...template, period: { period: "year", amount: 1 } };
    case "custom":
      return template;
  }
}

/**
 * Normalize a fixed-amount entry's template to `periodic`, so the editor
 * only ever has one shape to deal with. Legacy `simple { monthly }` becomes
 * `periodic { month, 1 }` — the same canonicalization the desktop editor does.
 */
export function toPeriodic(template: Template): PeriodicTemplate {
  if (template.type === "periodic") return template;
  if (template.type === "simple") {
    return {
      type: "periodic",
      amount: template.monthly ?? 0,
      period: { period: "month", amount: 1 },
      starting: `${currentMonth()}-01`,
      limit: template.limit,
      priority: template.priority,
      directive: "template",
    };
  }
  return createDefaultTemplate("fixed") as PeriodicTemplate;
}

// ---------------------------------------------------------------------------
// Amount access
// ---------------------------------------------------------------------------

/**
 * A template's money amount in cents, or null for the types that have none of
 * their own (percentage, historical, remainder, refill, schedule — their
 * amount is derived from income, history, or the linked schedule).
 *
 * Templates store amounts in display units ($50); the UI speaks cents.
 */
export function amountCentsOf(template: Template): number | null {
  switch (template.type) {
    case "periodic":
    case "by":
    case "spend":
    case "limit":
    case "goal":
      return Math.round(template.amount * 100);
    case "simple":
      // Refill-to-cap simple templates keep their amount in the limit.
      if (template.monthly != null) return Math.round(template.monthly * 100);
      if (template.limit) return Math.round(template.limit.amount * 100);
      return null;
    default:
      return null;
  }
}

/** Set a template's money amount from cents. A no-op for types without one. */
export function withAmountCents(template: Template, cents: number): Template {
  const amount = cents / 100;
  switch (template.type) {
    case "periodic":
    case "by":
    case "spend":
    case "limit":
    case "goal":
      return { ...template, amount };
    case "simple":
      if (template.monthly == null && template.limit) {
        return { ...template, limit: { ...template.limit, amount } };
      }
      return { ...template, monthly: amount };
    default:
      return template;
  }
}

/**
 * Retype an automation, carrying the amount across when both the old and new
 * shape have one — a user switching "save $500 by December" to a monthly goal
 * means to keep the 500.
 */
export function retypeTemplate(from: Template, displayType: DisplayTemplateType): Template {
  const fresh = createDefaultTemplate(displayType);
  const cents = amountCentsOf(from);
  if (cents == null || amountCentsOf(fresh) == null) return fresh;
  return withAmountCents(fresh, cents);
}

// Re-exported for editors that narrow on these shapes.
export type { AverageTemplate, ByTemplate, CopyTemplate, SpendTemplate };
