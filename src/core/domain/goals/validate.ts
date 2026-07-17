/**
 * Goal automation validation — mirrors the desktop client's
 * `components/budget/goals/validateAutomation.ts`, which in turn mirrors the
 * engine's own checks (`CategoryTemplateContext.checkByAndScheduleAndSpend`).
 *
 * Catching these in the editor is what keeps a user from saving a template
 * that the engine will silently refuse to budget.
 *
 * Pure — no native or React dependencies, safe to unit test in Node.
 */

import { amountCentsOf, type DisplayTemplateType, type ScheduleRef } from "./automations";
import type { Template } from "./types";

export type AutomationErrorKind =
  | { kind: "amount-zero" }
  | { kind: "schedule-not-found"; name: string }
  | { kind: "refill-no-cap" }
  | { kind: "limit-no-contributor" }
  | { kind: "percentage-out-of-range"; percent: number }
  | { kind: "percentage-no-source" }
  | { kind: "percentage-source-not-found"; source: string }
  | { kind: "by-no-month" }
  | { kind: "by-target-past"; month: string }
  | { kind: "spend-no-from" }
  | { kind: "spend-from-after-target" }
  | { kind: "adjustment-out-of-range" };

export type GlobalConflictKind =
  | { kind: "percent-over-100"; total: number }
  | { kind: "schedule-priority-mismatch" };

/** Schedule shape validation needs beyond identity. */
export type ValidatableSchedule = ScheduleRef & {
  completed?: boolean | number | null;
  tombstone?: boolean | number | null;
};

// ---------------------------------------------------------------------------
// Month helpers ("YYYY-MM")
// ---------------------------------------------------------------------------

const YEAR_MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function isValidYearMonth(month: string): boolean {
  return YEAR_MONTH_RE.test(month);
}

/** Calendar months between two "YYYY-MM" strings (to - from). */
function differenceInCalendarMonths(to: string, from: string): number {
  const [toY, toM] = to.split("-").map(Number);
  const [fromY, fromM] = from.split("-").map(Number);
  return (toY - fromY) * 12 + (toM - fromM);
}

function monthFromDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function isTruthyFlag(value: boolean | number | null | undefined): boolean {
  return value === true || value === 1;
}

function isAdjustmentOutOfRange(template: Template): boolean {
  if (
    (template.type === "schedule" || template.type === "average") &&
    template.adjustment !== undefined &&
    template.adjustmentType === "percent"
  ) {
    return template.adjustment <= -100 || template.adjustment > 1000;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Per-automation validation
// ---------------------------------------------------------------------------

/**
 * Validate one automation against its category's other templates.
 *
 * @param validPercentageSources Recognized percentage sources (income
 *   category ids plus the 'all-income' alias). When omitted the
 *   source-not-found check is skipped.
 */
export function validateAutomation(
  template: Template,
  displayType: DisplayTemplateType,
  allTemplates: readonly Template[],
  schedules: readonly ValidatableSchedule[],
  today: Date,
  validPercentageSources?: ReadonlySet<string>,
): AutomationErrorKind | null {
  // Any goal that carries its own money amount needs one — a $0 fixed goal,
  // cap or target budgets nothing. Types whose amount is derived elsewhere
  // (percentage, historical, remainder, schedule, refill) report null here.
  const cents = amountCentsOf(template);
  if (cents != null && cents <= 0) return { kind: "amount-zero" };

  // Date checks go by template type, not display type: a `by` lives under the
  // fixed editor (as Custom or Yearly) while `spend` has its own.
  if (template.type === "by" || template.type === "spend") {
    const dateError = validateTargetDate(template, today);
    if (dateError) return dateError;
  }

  switch (displayType) {
    case "schedule": {
      if (template.type !== "schedule") return null;
      if (!template.scheduleId && !template.name) {
        return { kind: "schedule-not-found", name: "" };
      }
      const match = schedules.find((s) =>
        template.scheduleId ? s.id === template.scheduleId : s.name === template.name,
      );
      if (!match || isTruthyFlag(match.completed) || isTruthyFlag(match.tombstone)) {
        return { kind: "schedule-not-found", name: template.name ?? "" };
      }
      if (isAdjustmentOutOfRange(template)) return { kind: "adjustment-out-of-range" };
      return null;
    }

    case "historical":
      if (isAdjustmentOutOfRange(template)) return { kind: "adjustment-out-of-range" };
      return null;

    case "refill":
      if (!allTemplates.some((t) => t.type === "limit")) return { kind: "refill-no-cap" };
      return null;

    case "limit":
      if (!allTemplates.some((t) => t.type !== "limit" && t.type !== "goal")) {
        return { kind: "limit-no-contributor" };
      }
      return null;

    case "percentage": {
      if (template.type !== "percentage") return null;
      if (!template.category) return { kind: "percentage-no-source" };
      if (template.percent <= 0 || template.percent > 100) {
        return { kind: "percentage-out-of-range", percent: template.percent };
      }
      if (
        validPercentageSources &&
        !validPercentageSources.has(template.category) &&
        !validPercentageSources.has(template.category.toLowerCase())
      ) {
        return { kind: "percentage-source-not-found", source: template.category };
      }
      return null;
    }

    default:
      return null;
  }
}

/** Target-date checks shared by `by` and `spend` templates. */
function validateTargetDate(
  template: Extract<Template, { type: "by" | "spend" }>,
  today: Date,
): AutomationErrorKind | null {
  if (!template.month || !isValidYearMonth(template.month)) return { kind: "by-no-month" };

  const targetMonth = template.month;
  const monthsRemaining = differenceInCalendarMonths(targetMonth, monthFromDate(today));

  // Recurring goals anchored on a past month are legitimate — the engine
  // rolls them forward by their period. Only one-shot goals can be stuck
  // in the past.
  if (monthsRemaining < 0 && !template.annual && !template.repeat) {
    return { kind: "by-target-past", month: targetMonth };
  }

  if (template.type === "spend") {
    if (!template.from || !isValidYearMonth(template.from)) return { kind: "spend-no-from" };
    if (differenceInCalendarMonths(targetMonth, template.from) < 0) {
      return { kind: "spend-from-after-target" };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Category-wide conflicts
// ---------------------------------------------------------------------------

/** More than 100% of one income source allocated across percentage templates. */
export function validatePercentageAllocation(
  templates: readonly Template[],
): GlobalConflictKind | null {
  const percentBySource = new Map<string, number>();
  for (const t of templates) {
    if (t.type !== "percentage" || !t.category) continue;
    const key = `${t.previous}|${t.category.toLowerCase()}`;
    percentBySource.set(key, (percentBySource.get(key) ?? 0) + t.percent);
  }
  const maxPercent = Math.max(0, ...percentBySource.values());
  return maxPercent > 100 ? { kind: "percent-over-100", total: maxPercent } : null;
}

/**
 * The engine requires every schedule and by-date template in a category to
 * share one priority; if they don't, none of them budget.
 *
 * `entriesToTemplates()` pins them together on save, so this is a safety net
 * for templates authored elsewhere (desktop, or hand-written notes).
 */
export function validateSchedulePriorities(
  templates: readonly Template[],
): GlobalConflictKind | null {
  const priorities = new Set<number>();
  for (const t of templates) {
    if (t.type === "schedule" || t.type === "by") priorities.add(t.priority);
  }
  return priorities.size > 1 ? { kind: "schedule-priority-mismatch" } : null;
}
