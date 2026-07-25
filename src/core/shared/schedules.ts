/**
 * Schedule logic shared between server and UI — recurrence expansion,
 * status computation, posted-occurrence matching and preview generation.
 * Mirrors loot-core/src/shared/schedules.ts; merged from the port's former
 * schedules/{recurrence,helpers,posted,status,computePreview}.
 */

import {
  addDays,
  addMonths,
  addWeeks,
  addYears,
  differenceInCalendarDays,
  format,
  getDate,
  getDay,
  getDaysInMonth,
  isAfter,
  isBefore,
  isEqual,
  isWeekend,
  lastDayOfMonth,
  nextMonday,
  previousFriday,
  setDate,
  startOfDay,
  startOfMonth,
} from "date-fns";
import type {
  RecurConfig,
  RecurPattern,
  RuleAction,
  RuleCondition,
  Schedule,
  ScheduleStatus,
} from "@/core/types/models";
import { currentDay, strToInt } from "./months";
import { q } from "@/core/queries";
import type { Query } from "@/core/shared/query";
import { RSchedule } from "@/core/server/util/rschedule";
import type { ByDayOfWeekEntry, IRuleOptions } from "@/core/server/util/rschedule";

/** The weekend-skip settings a schedule carries alongside its recurrence. */
export type ScheduleRecurData = { skipWeekend?: boolean; weekendSolve?: "before" | "after" };

type ScheduleRuleOptions = IRuleOptions & { interval?: number; byHourOfDay?: number[] };

// ═══ former schedules/recurrence.ts ═══

// ─── Date Helpers ──────────────────────────────────────────

/** Parse 'YYYY-MM-DD' to Date at noon (avoids timezone issues). */
export function parseDate(str: string): Date {
  const [y, m, d] = str.split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0, 0);
}

/** Format Date as 'YYYY-MM-DD'. */
export function dayFromDate(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

/** Shift a date to skip weekends per the solve mode. */
export function getDateWithSkippedWeekend(date: Date, solveMode: "before" | "after"): Date {
  if (isWeekend(date)) {
    return solveMode === "after" ? nextMonday(date) : previousFriday(date);
  }
  return date;
}

// ─── Recurrence engine ─────────────────────────────────────

/** Port of loot-core/src/shared/schedules.ts `recurConfigToRSchedule`. */
export function recurConfigToRSchedule(config: RecurConfig): IRuleOptions[] {
  const base: ScheduleRuleOptions = {
    start: parseDate(config.start),
    frequency: config.frequency.toUpperCase() as IRuleOptions["frequency"],
    byHourOfDay: [12],
  };

  if (config.interval) {
    base.interval = config.interval;
  }

  switch (config.endMode) {
    case "after_n_occurrences":
      base.count = config.endOccurrences;
      break;
    case "on_date":
      base.end = parseDate(config.endDate!);
      break;
    default:
      break;
  }

  const abbrevDay = (name: string) => name.slice(0, 2).toUpperCase();

  switch (config.frequency) {
    case "daily":
    case "weekly":
    case "yearly":
      return [base];
    case "monthly":
      if (config.patterns && config.patterns.length > 0) {
        const days = config.patterns.filter((p) => p.type === "day");
        const dayNames = config.patterns.filter((p) => p.type !== "day");

        return [
          days.length > 0 && { ...base, byDayOfMonth: days.map((p) => p.value) },
          dayNames.length > 0 && {
            ...base,
            byDayOfWeek: dayNames.map((p) => [abbrevDay(p.type), p.value] as ByDayOfWeekEntry),
          },
        ].filter(Boolean) as IRuleOptions[];
      }
      return [base];
    default:
      throw new Error("Invalid recurring date config");
  }
}

/** Build the recurrence for a schedule's date condition. */
export function scheduleFromRecurConfig(config: RecurConfig): RSchedule<ScheduleRecurData> {
  return new RSchedule<ScheduleRecurData>({
    rrules: recurConfigToRSchedule(config),
    data: { skipWeekend: config.skipWeekend, weekendSolve: config.weekendSolveMode },
  });
}

/**
 * Next date for a schedule's date condition, as 'YYYY-MM-DD'.
 * Port of loot-core/src/shared/schedules.ts `getNextDate`.
 *
 * Upstream routes the condition value through `Condition.getValue()`; we read
 * the two shapes it can hold directly, to keep src/core/shared free of an
 * import cycle back into the rules engine.
 */
export function getNextDate(
  dateCond: RuleCondition,
  start: Date = startOfDay(new Date()),
  noSkipWeekend = false,
): string | null {
  if (typeof dateCond.value === "string") {
    return dateCond.value;
  }
  if (!dateCond.value || typeof dateCond.value !== "object") {
    return null;
  }

  const schedule = scheduleFromRecurConfig(dateCond.value as RecurConfig);

  let dates = schedule.occurrences({ start: startOfDay(start), take: 1 }).toArray();
  if (dates.length === 0) {
    // A finite schedule that has run out: fall back to its last occurrence, so
    // the UI can still show when it ended.
    dates = schedule.occurrences({ reverse: true, take: 1 }).toArray();
  }
  if (dates.length === 0) {
    return null;
  }

  let date = dates[0].date;
  if (schedule.data.skipWeekend && !noSkipWeekend) {
    date = getDateWithSkippedWeekend(date, schedule.data.weekendSolve ?? "after");
  }
  return dayFromDate(date);
}

// ═══ former schedules/helpers.ts ═══

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
export function getUpcomingDays(upcomingLength = "7", today = currentDay()): number {
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

  const today = currentDay();
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

// ═══ former schedules/posted.ts ═══

export type ScheduleOccurrenceMatchInput = {
  posts_transaction?: boolean;
  _conditions?: RuleCondition[];
};

export type PostedScheduleTransaction = {
  schedule?: string | null;
  date: string;
};

/** Subtract whole days from a 'YYYY-MM-DD' string (timezone-safe, noon anchor). */
function subDaysStr(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return format(addDays(new Date(y, m - 1, d, 12, 0, 0), -days), "yyyy-MM-dd");
}

/**
 * Lower bound for matching a posted transaction to a schedule occurrence date.
 *
 * - Exact date condition (`op === 'is'`): match from the occurrence date only.
 * - Auto-posted (`posts_transaction`): exact occurrence date — auto-posted dates
 *   are always precise, so a lookback would let yesterday's transaction falsely
 *   match today's occurrence.
 * - Otherwise (manual recurring with `isapprox`, etc.): 2-day lookback to catch
 *   early payments.
 */
export function getScheduleOccurrenceMatchStartDate(
  schedule: ScheduleOccurrenceMatchInput,
  occurrenceDate: string,
): string {
  const dateCond = schedule._conditions?.find((c) => c.field === "date");
  if (dateCond?.op === "is") {
    return occurrenceDate;
  }
  if (schedule.posts_transaction) {
    return occurrenceDate;
  }
  return subDaysStr(occurrenceDate, 2);
}

/** Group posted schedule transactions by their linked schedule id. */
export function indexPostedScheduleTransactions(
  transactions: PostedScheduleTransaction[],
): Map<string, PostedScheduleTransaction[]> {
  const byScheduleId = new Map<string, PostedScheduleTransaction[]>();

  for (const transaction of transactions) {
    if (!transaction.schedule) {
      continue;
    }

    const existing = byScheduleId.get(transaction.schedule);
    if (existing) {
      existing.push(transaction);
    } else {
      byScheduleId.set(transaction.schedule, [transaction]);
    }
  }

  return byScheduleId;
}

/** Whether a specific schedule occurrence already has a posted transaction. */
export function isScheduleOccurrencePosted({
  schedule,
  scheduleId,
  occurrenceDate,
  postedTransactions,
}: {
  schedule: ScheduleOccurrenceMatchInput;
  scheduleId: string;
  occurrenceDate: string;
  postedTransactions: PostedScheduleTransaction[];
}): boolean {
  const matchStartDate = getScheduleOccurrenceMatchStartDate(schedule, occurrenceDate);

  return postedTransactions.some(
    (tx) => tx.schedule === scheduleId && tx.date >= matchStartDate && tx.date <= occurrenceDate,
  );
}

// ═══ former schedules/status.ts ═══

export type ScheduleStatuses = Map<string, ScheduleStatus>;

/**
 * Build an AQL query to find transactions linked to the given schedules.
 * Used to determine "paid" status. The per-schedule date lower bound comes from
 * getScheduleOccurrenceMatchStartDate (accounts for exact/auto-posted/approx).
 */
export function getHasTransactionsQuery(schedules: Schedule[]): Query | null {
  if (schedules.length === 0) return null;

  const filters = schedules
    .filter((s) => s.next_date != null)
    .map((s) => ({
      $and: [
        { schedule: s.id },
        { date: { $gte: getScheduleOccurrenceMatchStartDate(s, s.next_date!) } },
      ],
    }));

  if (filters.length === 0) return null;

  return q("transactions")
    .options({ splits: "all" })
    .filter({ $or: filters })
    .orderBy({ date: "desc" })
    .select(["schedule", "date"]);
}

/**
 * Determine if a schedule should appear as a preview transaction.
 */
export function isForPreview(schedule: Schedule, statuses: ScheduleStatuses): boolean {
  const status = statuses.get(schedule.id);
  return (
    !schedule.completed && status != null && ["due", "upcoming", "missed", "paid"].includes(status)
  );
}

// ═══ former schedules/computePreview.ts ═══

export type PreviewSubtransaction = {
  id: string;
  amount: number;
  category: string | null;
  categoryName: string | null;
};

export type PreviewTransaction = {
  id: string;
  scheduleId: string;
  payee: string | null;
  payeeName: string;
  account: string | null;
  accountName: string | null;
  category?: string | null;
  categoryName: string | null;
  amount: number;
  date: number; // YYYYMMDD int
  dateStr: string; // YYYY-MM-DD
  status: ScheduleStatus;
  isRecurring: boolean;
  forceUpcoming: boolean;
  /** Present when the schedule's rule splits the amount across categories. */
  subtransactions?: PreviewSubtransaction[];
};

/**
 * Compute preview transactions for display in transaction lists.
 *
 * Ported from Actual's computeSchedulePreviewTransactions: expands recurring
 * schedules up to a per-schedule upcoming window (`custom_upcoming_length ??
 * upcomingLength`), drops the first occurrence when already paid, and marks
 * future/paid occurrences `forceUpcoming`.
 *
 * @param upcomingLength - Global upcoming-length pref string (e.g. "7", "oneMonth").
 * @param filter - Optional filter (e.g. by account).
 */
export function computePreviewTransactions(
  schedules: Schedule[],
  statuses: ScheduleStatuses,
  payeeNames: Map<string, string>,
  categoryNames: Map<string, string>,
  accountNames: Map<string, string>,
  upcomingLength = "7",
  filter?: (schedule: Schedule) => boolean,
): PreviewTransaction[] {
  const forPreview = schedules
    .filter((s) => isForPreview(s, statuses))
    .filter(filter ?? (() => true));

  if (forPreview.length === 0) return [];

  const today = startOfDay(new Date());
  const todayString = currentDay();

  const previews: PreviewTransaction[] = [];

  for (const schedule of forPreview) {
    const status = statuses.get(schedule.id)!;
    const conds = extractScheduleConds(schedule._conditions ?? []);
    const isRecurring = scheduleIsRecurring(conds.date);

    // Per-schedule upcoming window (custom overrides the global pref).
    const effectiveUpcomingLength = schedule.custom_upcoming_length ?? upcomingLength;
    const boundary = addDays(today, getUpcomingDays(effectiveUpcomingLength, todayString));

    // Collect dates: start with next_date, expand recurring up to the boundary.
    const dates: string[] = [];
    if (schedule.next_date) {
      dates.push(schedule.next_date);

      if (isRecurring && conds.date?.value) {
        // Expand through getNextDate, which already applies the weekend skip,
        // then step past the adjusted date. Mirrors upstream's preview loop.
        let day = parseDate(schedule.next_date);
        while (day <= boundary) {
          const nextDateStr = getNextDate(conds.date, day);
          if (!nextDateStr) break;

          const nextDay = parseDate(nextDateStr);
          // An exhausted schedule reports its last occurrence, which is behind
          // us — without this the loop would walk backwards forever.
          if (nextDay < day) break;
          if (startOfDay(nextDay) > boundary) break;

          if (!dates.includes(nextDateStr)) {
            dates.push(nextDateStr);
          }

          day = addDays(nextDay, 1);
        }
      }
    }

    // If status is "paid", remove the first date (already posted)
    if (status === "paid" && dates.length > 0) {
      dates.shift();
    }

    // Create a preview for each date
    const amount = getScheduledAmount(schedule._amount);

    for (const dateStr of dates) {
      const dateInt = strToInt(dateStr);
      if (dateInt == null) continue;

      const forceUpcoming =
        (dateStr !== schedule.next_date || status === "paid") && dateStr >= todayString;

      previews.push({
        // Match Actual's id format: preview/<scheduleId>/<YYYY-MM-DD>.
        id: `preview/${schedule.id}/${dateStr}`,
        scheduleId: schedule.id,
        payee: schedule._payee,
        payeeName: payeeNames.get(schedule._payee ?? "") ?? "(no payee)",
        account: schedule._account,
        accountName: schedule._account ? (accountNames.get(schedule._account) ?? null) : null,
        category: schedule._category,
        categoryName: schedule._category ? (categoryNames.get(schedule._category) ?? null) : null,
        amount,
        date: dateInt,
        dateStr,
        status: forceUpcoming ? "upcoming" : status,
        isRecurring,
        forceUpcoming,
      });
    }
  }

  // Sort by date descending, then amount
  previews.sort((a, b) => b.date - a.date || a.amount - b.amount);

  return previews;
}
