/**
 * Schedule helpers — ported from Actual Budget's shared/schedules.ts.
 */

import { format, addDays } from "date-fns";
import type { RuleCondition, RecurConfig, ScheduleStatus } from "./types";
import { todayStr } from "../lib/date";

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
  const upcomingDays = parseInt(upcomingLength, 10) || 7;

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
