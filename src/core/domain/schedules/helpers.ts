/**
 * Schedule helpers — ported from Actual Budget's shared/schedules.ts.
 */

import {
  format,
  addDays,
  addMonths,
  startOfMonth,
  lastDayOfMonth,
  getDate,
  differenceInCalendarDays,
} from "date-fns";
import type { RuleCondition, RuleAction, RecurConfig, ScheduleStatus } from "./types";
import { todayStr } from "@/lib/date";

/**
 * Extract the schedule-specific conditions from a rule's conditions array.
 * Returns null for any field not found.
 */
export function extractScheduleConds(conditions: RuleCondition[]) {
  return {
    payee:
      conditions.find((c) => c.op === "is" && c.field === "payee") ??
      conditions.find((c) => c.op === "is" && c.field === "description") ??
      null,
    account:
      conditions.find((c) => c.op === "is" && c.field === "account") ??
      conditions.find((c) => c.op === "is" && c.field === "acct") ??
      null,
    amount:
      conditions.find(
        (c) =>
          (c.op === "is" || c.op === "isapprox" || c.op === "isbetween") && c.field === "amount",
      ) ?? null,
    date:
      conditions.find((c) => (c.op === "is" || c.op === "isapprox") && c.field === "date") ?? null,
  };
}

/**
 * Number of days that count as "upcoming", from the `upcomingLength` preference
 * (or a schedule's `custom_upcoming_length`). Ported verbatim from Actual's
 * getUpcomingDays: supports 'currentMonth', 'oneMonth', 'N-day|week|month|year',
 * and plain numeric strings.
 */
export function getUpcomingDays(upcomingLength = "7", today = todayStr()): number {
  const todayDate = parseLocalDate(today);
  const monthStart = startOfMonth(todayDate);

  switch (upcomingLength) {
    case "currentMonth": {
      const day = getDate(todayDate);
      const end = getDate(lastDayOfMonth(todayDate));
      return end - day;
    }
    case "oneMonth": {
      return differenceInCalendarDays(addMonths(monthStart, 1), monthStart);
    }
    default: {
      if (upcomingLength.includes("-")) {
        const [num, unit] = upcomingLength.split("-");
        const value = Math.max(1, parseInt(num, 10));
        switch (unit) {
          case "day":
            return value;
          case "week":
            return value * 7;
          case "month":
            return differenceInCalendarDays(addMonths(todayDate, value), monthStart) + 1;
          case "year":
            return differenceInCalendarDays(addMonths(todayDate, value * 12), monthStart) + 1;
          default:
            return 7;
        }
      }
      return parseInt(upcomingLength, 10);
    }
  }
}

/**
 * Whether a schedule's date condition is a recurrence (vs a one-off date).
 * Mirrors Actual's scheduleIsRecurring (recur value → object with a frequency).
 */
export function scheduleIsRecurring(dateCond: RuleCondition | null | undefined): boolean {
  if (!dateCond) return false;
  const v = dateCond.value;
  return typeof v === "object" && v != null && "frequency" in v;
}

/** Trim a schedule name, collapsing empty to null. Ported from Actual. */
export function normalizeScheduleName(name: string | null | undefined): string | null {
  const trimmed = name?.trim();
  return trimmed || null;
}

/**
 * Deep structural equality of two rule-condition values (arrays/objects/
 * primitives), matching Actual's areConditionValuesEqual.
 */
export function areConditionValuesEqual(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (left == null || right == null) return left === right;

  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => areConditionValuesEqual(value, right[index]))
    );
  }

  if (typeof left === "object" && typeof right === "object") {
    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();
    return (
      leftKeys.length === rightKeys.length &&
      leftKeys.every((key, index) => {
        const rightKey = rightKeys[index];
        return (
          key === rightKey &&
          areConditionValuesEqual(
            (left as Record<string, unknown>)[key],
            (right as Record<string, unknown>)[rightKey],
          )
        );
      })
    );
  }

  return false;
}

/** Compare two schedule conditions ignoring their `type` field. */
export function areScheduleConditionsEqual(left?: RuleCondition, right?: RuleCondition): boolean {
  if (left == null || right == null) return left === right;
  const { type: _lt, ...leftRest } = left;
  const { type: _rt, ...rightRest } = right;
  return areConditionValuesEqual(leftRest, rightRest);
}

/**
 * Keep a rule's plain `set amount` action in sync with its amount condition
 * (a schedule's amount lives in the condition; a stale `set amount` action
 * would revert a posted transaction to the old amount). Templated/formula
 * actions and `set-split-amount` are left untouched. Returns null when nothing
 * changed. Ported from Actual's updateActions.
 */
export function updateActions(
  conditions: RuleCondition[],
  actions: RuleAction[],
): RuleAction[] | null {
  const { amount: amountCond } = extractScheduleConds(conditions);
  if (amountCond == null) return null;

  const amount = getScheduledAmount(
    amountCond.value as number | { num1: number; num2: number } | null,
  );

  let changed = false;
  const updated = actions.map((action) => {
    if (
      action.op === "set" &&
      action.field === "amount" &&
      !action.options?.template &&
      !action.options?.formula &&
      action.value !== amount
    ) {
      changed = true;
      return { ...action, value: amount };
    }
    return action;
  });

  return changed ? updated : null;
}

/**
 * Determine the status of a schedule based on its next date and state.
 */
export function getStatus(
  nextDate: string | null,
  completed: boolean,
  hasTrans: boolean,
  upcomingLength = "7",
): ScheduleStatus {
  if (completed) return "completed";
  if (hasTrans) return "paid";
  if (!nextDate) return "scheduled";

  const today = todayStr();
  const upcomingDays = getUpcomingDays(upcomingLength, today);

  if (nextDate === today) return "due";

  // Calculate upcoming boundary
  const todayDate = parseLocalDate(today);
  const boundary = addDays(todayDate, upcomingDays);
  const boundaryStr = format(boundary, "yyyy-MM-dd");

  if (nextDate > today && nextDate <= boundaryStr) return "upcoming";
  if (nextDate < today) return "missed";
  return "scheduled";
}

/**
 * Get the effective amount from a schedule amount (simple or range).
 */
export function getScheduledAmount(
  amount: number | { num1: number; num2: number } | null,
  inverse = false,
): number {
  if (amount == null) return 0;
  if (typeof amount === "number") {
    return inverse ? -amount : amount;
  }
  const avg = Math.round((amount.num1 + amount.num2) / 2);
  return inverse ? -avg : avg;
}

/**
 * Generate a human-readable description of a recurrence config.
 */
export function getRecurringDescription(config: RecurConfig): string {
  const interval = config.interval ?? 1;
  const startDate = parseLocalDate(config.start);

  let desc: string;

  switch (config.frequency) {
    case "daily":
      desc = interval !== 1 ? `Every ${interval} days` : "Every day";
      break;
    case "weekly": {
      const dayName = format(startDate, "EEEE");
      desc = interval !== 1 ? `Every ${interval} weeks on ${dayName}` : `Every week on ${dayName}`;
      break;
    }
    case "monthly":
      if (config.patterns && config.patterns.length > 0) {
        const parts = config.patterns.map((p) => {
          if (p.type === "day") {
            return p.value === -1 ? "last day" : ordinal(p.value);
          }
          const dayName = DAY_NAMES[p.type] ?? p.type;
          return p.value === -1 ? `last ${dayName}` : `${ordinal(p.value)} ${dayName}`;
        });
        const range =
          parts.length > 2
            ? `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`
            : parts.join(" and ");
        desc =
          interval !== 1
            ? `Every ${interval} months on the ${range}`
            : `Every month on the ${range}`;
      } else {
        const dayOrd = format(startDate, "do");
        desc =
          interval !== 1
            ? `Every ${interval} months on the ${dayOrd}`
            : `Every month on the ${dayOrd}`;
      }
      break;
    case "yearly": {
      const dateStr = format(startDate, "LLL do");
      desc = interval !== 1 ? `Every ${interval} years on ${dateStr}` : `Every year on ${dateStr}`;
      break;
    }
    default:
      return "Recurring error";
  }

  // End mode suffix
  let suffix = "";
  if (config.endMode === "after_n_occurrences") {
    suffix = config.endOccurrences === 1 ? ", once" : `, ${config.endOccurrences} times`;
  } else if (config.endMode === "on_date" && config.endDate) {
    suffix = `, until ${config.endDate}`;
  }

  if (config.skipWeekend) {
    const mode = config.weekendSolveMode === "before" ? "before" : "after";
    suffix += ` (${mode} weekend)`;
  }

  return `${desc}${suffix}`.trim();
}

// ── Internal helpers ──────────────────────────────────────

const DAY_NAMES: Record<string, string> = {
  SU: "Sunday",
  MO: "Monday",
  TU: "Tuesday",
  WE: "Wednesday",
  TH: "Thursday",
  FR: "Friday",
  SA: "Saturday",
};

function ordinal(n: number): string {
  const suffixes = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (suffixes[(v - 20) % 10] ?? suffixes[v] ?? suffixes[0]);
}

function parseLocalDate(str: string): Date {
  const [y, m, d] = str.split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0, 0);
}
