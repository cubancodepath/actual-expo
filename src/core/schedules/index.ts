/**
 * Schedules module — CRUD operations for scheduled/recurring transactions.
 *
 * Follows the same pattern as transactions/index.ts:
 *   - Raw SQL via db helpers
 *   - Mutations via sendMessages() for CRDT sync
 *   - undoable() wrapper for undo support
 */

import { randomUUID } from "expo-crypto";
import { runQuery, first, run } from "../db";
import { sendMessages, batchMessages } from "../sync";
import { undoable } from "../sync/undo";
import { Timestamp } from "../crdt";
import { createRule, updateRule, deleteRule, getRuleById } from "../rules";
import {
  getNextOccurrence,
  getUpcomingDates as getUpcomingRecurDates,
  getDateWithSkippedWeekend,
  parseDate,
  dayFromDate,
} from "./recurrence";
import { extractScheduleConds, getStatus, getScheduledAmount } from "./helpers";
import { todayStr, todayInt, intToStr, strToInt } from "@/lib/date";
import { addDays, startOfDay, isFriday, isWeekend, nextMonday } from "date-fns";
import type { Schedule, RuleCondition, RuleAction, RecurConfig } from "./types";
import type { ScheduleRow, ScheduleNextDateRow } from "../db/types";

export type { Schedule } from "./types";
export {
  getStatus,
  getScheduledAmount,
  getRecurringDescription,
  extractScheduleConds,
} from "./helpers";
export { getUpcomingDates as getUpcomingRecurDates } from "./recurrence";

// ── Helpers ──────────────────────────────────────────────────────

function toDateRepr(dateStr: string): number {
  return strToInt(dateStr)!;
}

function fromDateRepr(repr: number | null): string | null {
  if (repr == null) return null;
  return intToStr(repr);
}

/**
 * Parse a row (from the JOIN query) into a Schedule domain object.
 */
function rowToSchedule(row: any): Schedule {
  const conditions: RuleCondition[] = row.conditions ? JSON.parse(row.conditions) : [];
  const actions: RuleAction[] = row.actions ? JSON.parse(row.actions) : [];
  const conds = extractScheduleConds(conditions);

  const categoryAction = actions.find((a) => a.op === "set" && a.field === "category");

  return {
    id: row.id,
    name: row.name ?? null,
    rule: row.rule ?? "",
    completed: row.completed === 1,
    posts_transaction: row.posts_transaction === 1,
    tombstone: row.tombstone === 1,
    next_date: fromDateRepr(row.local_next_date ?? row.base_next_date ?? null),
    _payee: (conds.payee?.value as string) ?? null,
    _account: (conds.account?.value as string) ?? null,
    _amount: (conds.amount?.value as number | { num1: number; num2: number }) ?? null,
    _amountOp: conds.amount?.op ?? null,
    _date: (conds.date?.value as RecurConfig | string) ?? null,
    _category: (categoryAction?.value as string) ?? null,
    _conditions: conditions,
  };
}

// ── Queries ──────────────────────────────────────────────────────

export async function getSchedules(): Promise<Schedule[]> {
  const rows = await runQuery<any>(
    `SELECT s.*,
            snd.local_next_date,
            snd.base_next_date,
            r.conditions,
            r.actions
     FROM schedules s
     LEFT JOIN schedules_next_date snd
       ON snd.schedule_id = s.id AND snd.tombstone = 0
     LEFT JOIN rules r
       ON r.id = s.rule AND r.tombstone = 0
     WHERE s.tombstone = 0
     ORDER BY COALESCE(snd.local_next_date, snd.base_next_date) ASC`,
  );
  return rows.map(rowToSchedule);
}

export async function getScheduleById(id: string): Promise<Schedule | null> {
  const rows = await runQuery<any>(
    `SELECT s.*,
            snd.local_next_date,
            snd.base_next_date,
            r.conditions,
            r.actions
     FROM schedules s
     LEFT JOIN schedules_next_date snd
       ON snd.schedule_id = s.id AND snd.tombstone = 0
     LEFT JOIN rules r
       ON r.id = s.rule AND r.tombstone = 0
     WHERE s.id = ? AND s.tombstone = 0`,
    [id],
  );
  return rows.length > 0 ? rowToSchedule(rows[0]) : null;
}

// ── Next Date Calculation ────────────────────────────────────────

/**
 * Compute the next date from a date condition.
 * Mirrors original Actual's getNextDate from shared/schedules.ts.
 */
function computeNextDate(
  dateCond: RuleCondition,
  start: Date = startOfDay(new Date()),
  noSkipWeekend = false,
): string | null {
  if (typeof dateCond.value === "string") {
    // Simple one-time date
    return dateCond.value;
  }

  const config = dateCond.value as RecurConfig;
  const next = getNextOccurrence(config, start);
  if (!next) {
    // Finite schedule exhausted — try last occurrence
    const { getLastOccurrence } = require("./recurrence");
    const last = getLastOccurrence(config);
    if (last) {
      let date = last;
      if (config.skipWeekend && !noSkipWeekend) {
        date = getDateWithSkippedWeekend(date, config.weekendSolveMode ?? "after");
      }
      return dayFromDate(date);
    }
    return null;
  }

  let date = next;
  if (config.skipWeekend && !noSkipWeekend) {
    date = getDateWithSkippedWeekend(date, config.weekendSolveMode ?? "after");
  }
  return dayFromDate(date);
}

// ── setNextDate ──────────────────────────────────────────────────

export async function setNextDate(opts: {
  id: string;
  start?: (nextDate: string) => Date;
  conditions?: RuleCondition[];
  reset?: boolean;
  skipRequested?: boolean;
}): Promise<void> {
  let conditions = opts.conditions;

  if (!conditions) {
    const schedule = await first<{ rule: string }>(
      "SELECT rule FROM schedules WHERE id = ? AND tombstone = 0",
      [opts.id],
    );
    if (!schedule?.rule) throw new Error("No rule found for schedule");

    const rule = await getRuleById(schedule.rule);
    if (!rule) throw new Error("No rule found for schedule");
    conditions = rule.conditions.map((c) =>
      typeof c.serialize === "function"
        ? (c.serialize() as unknown as RuleCondition)
        : (c as unknown as RuleCondition),
    );
  }

  const { date: dateCond } = extractScheduleConds(conditions);
  if (!dateCond) return;

  // Get current next_date
  const nd = await first<ScheduleNextDateRow>(
    "SELECT * FROM schedules_next_date WHERE schedule_id = ? AND tombstone = 0",
    [opts.id],
  );
  if (!nd) return;

  let nextDate = fromDateRepr(nd.local_next_date ?? nd.base_next_date);

  // Handle skip with weekend-before mode
  if (opts.skipRequested && nextDate) {
    const config = dateCond.value as RecurConfig;
    if (config?.weekendSolveMode === "before" && config?.skipWeekend === true) {
      const parsed = parseDate(nextDate);
      if (isFriday(parsed) || isWeekend(parsed)) {
        nextDate = dayFromDate(nextMonday(parsed));
      }
    }
  }

  const startDate = opts.start && nextDate ? opts.start(nextDate) : startOfDay(new Date());

  const newNextDate = computeNextDate(dateCond, startDate);

  // Never regress the date unless this is an explicit reset (e.g. condition change)
  if (
    newNextDate &&
    newNextDate !== nextDate &&
    (opts.reset || !nextDate || newNextDate > nextDate)
  ) {
    if (opts.reset) {
      await sendMessages([
        {
          timestamp: Timestamp.send()!,
          dataset: "schedules_next_date",
          row: nd.id,
          column: "base_next_date",
          value: toDateRepr(newNextDate),
        },
        {
          timestamp: Timestamp.send()!,
          dataset: "schedules_next_date",
          row: nd.id,
          column: "base_next_date_ts",
          value: Date.now(),
        },
      ]);
    } else {
      await sendMessages([
        {
          timestamp: Timestamp.send()!,
          dataset: "schedules_next_date",
          row: nd.id,
          column: "local_next_date",
          value: toDateRepr(newNextDate),
        },
        {
          timestamp: Timestamp.send()!,
          dataset: "schedules_next_date",
          row: nd.id,
          column: "local_next_date_ts",
          value: nd.base_next_date_ts ?? Date.now(),
        },
      ]);
    }
  }
}

// ── CRUD ─────────────────────────────────────────────────────────

export const createSchedule = undoable(async function createSchedule(opts: {
  schedule?: Partial<Schedule> & { id?: string };
  conditions: RuleCondition[];
  actions?: RuleAction[];
}): Promise<string> {
  const scheduleId = opts.schedule?.id ?? randomUUID();

  const { date: dateCond } = extractScheduleConds(opts.conditions);
  if (!dateCond) {
    throw new Error("A date condition is required to create a schedule");
  }
  if (dateCond.value == null) {
    throw new Error("Date is required");
  }

  // Check for duplicate name
  if (opts.schedule?.name) {
    const existing = await first<{ id: string }>(
      "SELECT id FROM schedules WHERE tombstone = 0 AND name = ?",
      [opts.schedule.name],
    );
    if (existing && existing.id !== scheduleId) {
      throw new Error("Cannot create schedules with the same name");
    }
  }

  const nextDate = computeNextDate(dateCond);
  const nextDateRepr = nextDate ? toDateRepr(nextDate) : null;

  // Create the rule with link-schedule action + optional set actions
  const ruleActions: RuleAction[] = [
    { op: "link-schedule", value: scheduleId },
    ...(opts.actions ?? []),
  ];
  const ruleId = await createRule({
    conditionsOp: "and",
    conditions: opts.conditions,
    actions: ruleActions,
  });

  // Create schedules_next_date entry
  const ndId = randomUUID();
  const now = Date.now();

  await sendMessages([
    {
      timestamp: Timestamp.send()!,
      dataset: "schedules_next_date",
      row: ndId,
      column: "schedule_id",
      value: scheduleId,
    },
    {
      timestamp: Timestamp.send()!,
      dataset: "schedules_next_date",
      row: ndId,
      column: "local_next_date",
      value: nextDateRepr,
    },
    {
      timestamp: Timestamp.send()!,
      dataset: "schedules_next_date",
      row: ndId,
      column: "local_next_date_ts",
      value: now,
    },
    {
      timestamp: Timestamp.send()!,
      dataset: "schedules_next_date",
      row: ndId,
      column: "base_next_date",
      value: nextDateRepr,
    },
    {
      timestamp: Timestamp.send()!,
      dataset: "schedules_next_date",
      row: ndId,
      column: "base_next_date_ts",
      value: now,
    },
  ]);

  // Create the schedule
  await sendMessages([
    {
      timestamp: Timestamp.send()!,
      dataset: "schedules",
      row: scheduleId,
      column: "rule",
      value: ruleId,
    },
    {
      timestamp: Timestamp.send()!,
      dataset: "schedules",
      row: scheduleId,
      column: "name",
      value: opts.schedule?.name ?? null,
    },
    {
      timestamp: Timestamp.send()!,
      dataset: "schedules",
      row: scheduleId,
      column: "completed",
      value: 0,
    },
    {
      timestamp: Timestamp.send()!,
      dataset: "schedules",
      row: scheduleId,
      column: "posts_transaction",
      value: opts.schedule?.posts_transaction ? 1 : 0,
    },
    {
      timestamp: Timestamp.send()!,
      dataset: "schedules",
      row: scheduleId,
      column: "tombstone",
      value: 0,
    },
  ]);

  // Update JSON paths (local-only optimization, not synced)
  await updateJsonPaths(scheduleId, opts.conditions);

  return scheduleId;
});

export const updateSchedule = undoable(async function updateSchedule(opts: {
  schedule: Partial<Schedule> & { id: string };
  conditions?: RuleCondition[];
  actions?: RuleAction[];
  resetNextDate?: boolean;
}): Promise<string> {
  const { schedule, conditions, actions, resetNextDate } = opts;

  if (conditions) {
    const { date: dateCond } = extractScheduleConds(conditions);
    if (dateCond && dateCond.value == null) {
      throw new Error("Date is required");
    }

    // Get existing rule
    const row = await first<{ rule: string }>(
      "SELECT rule FROM schedules WHERE id = ? AND tombstone = 0",
      [schedule.id],
    );
    if (!row?.rule) throw new Error("Schedule has no rule");

    const rule = await getRuleById(row.rule);
    if (!rule) throw new Error("Rule not found for schedule");

    await batchMessages(async () => {
      // Serialize Rule class instances back to plain objects for merging/saving
      const existingConds = rule.conditions.map((c) =>
        typeof c.serialize === "function"
          ? (c.serialize() as unknown as RuleCondition)
          : (c as unknown as RuleCondition),
      );
      const existingActions = rule.actions.map((a) =>
        typeof a.serialize === "function"
          ? (a.serialize() as unknown as RuleAction)
          : (a as unknown as RuleAction),
      );
      // Merge old conditions with new
      const newConditions = mergeConditions(existingConds, conditions);
      // Merge actions: keep link-schedule, replace set actions
      const newActions =
        actions !== undefined
          ? [...existingActions.filter((a) => a.op === "link-schedule"), ...actions]
          : undefined;
      await updateRule(rule.id!, { conditions: newConditions, actions: newActions });

      // Recalculate next date if conditions changed or reset requested
      if (resetNextDate) {
        await setNextDate({
          id: schedule.id,
          conditions: newConditions,
          reset: true,
        });
      }

      // Update schedule metadata
      await updateScheduleMetadata(schedule);
    });

    await updateJsonPaths(schedule.id, conditions);
  } else {
    await batchMessages(async () => {
      if (resetNextDate) {
        await setNextDate({ id: schedule.id, reset: true });
      }
      await updateScheduleMetadata(schedule);
    });
  }

  return schedule.id;
});

export const deleteSchedule = undoable(async function deleteSchedule(id: string): Promise<void> {
  const row = await first<{ rule: string }>("SELECT rule FROM schedules WHERE id = ?", [id]);

  await batchMessages(async () => {
    if (row?.rule) {
      await deleteRule(row.rule);
    }
    await sendMessages([
      {
        timestamp: Timestamp.send()!,
        dataset: "schedules",
        row: id,
        column: "tombstone",
        value: 1,
      },
    ]);
  });
});

export const skipNextDate = undoable(async function skipNextDate(id: string): Promise<void> {
  await setNextDate({
    id,
    start: (nextDate) => addDays(parseDate(nextDate), 1),
    skipRequested: true,
  });
});

export const postTransactionForSchedule = undoable(async function postTransactionForSchedule(
  id: string,
): Promise<void> {
  const schedule = await getScheduleById(id);
  if (!schedule || !schedule._account) return;

  const { addTransaction } = await import("../transactions");
  const amount = getScheduledAmount(schedule._amount);
  const date = schedule.next_date ? toDateRepr(schedule.next_date) : todayInt();

  await addTransaction({
    account: schedule._account,
    date,
    amount,
    payee: schedule._payee ?? undefined,
    category: schedule._category ?? undefined,
    cleared: false,
    schedule: id,
  });
});

export const postTransactionForScheduleToday = undoable(
  async function postTransactionForScheduleToday(id: string): Promise<void> {
    const schedule = await getScheduleById(id);
    if (!schedule || !schedule._account) return;

    const { addTransaction } = await import("../transactions");
    const amount = getScheduledAmount(schedule._amount);

    await addTransaction({
      account: schedule._account,
      date: todayInt(),
      amount,
      payee: schedule._payee ?? undefined,
      category: schedule._category ?? undefined,
      cleared: false,
      schedule: id,
    });
  },
);

// ── Advance Schedules Service ────────────────────────────────────

/**
 * Check all active schedules and advance/post as needed.
 * Called after each sync (both success and failure).
 */
export async function advanceSchedules(syncSuccess: boolean): Promise<void> {
  const schedules = await getSchedules();
  const active = schedules.filter((s) => !s.completed);

  // Find which schedules have transactions linked
  const hasTrans = await getSchedulesWithTransactions(active);

  for (const schedule of active) {
    const status = getStatus(schedule.next_date, schedule.completed, hasTrans.has(schedule.id));

    if (status === "paid") {
      if (schedule._date && typeof schedule._date === "object" && "frequency" in schedule._date) {
        // Recurring: advance to next occurrence
        try {
          await setNextDate({ id: schedule.id });
        } catch {
          // Skip corrupt rules
        }
      } else if (typeof schedule._date === "string" && schedule._date < todayStr()) {
        // One-time: complete if past due
        await updateScheduleField(schedule.id, "completed", 1);
      }
    } else if (
      (status === "due" || status === "missed") &&
      schedule.posts_transaction &&
      schedule._account
    ) {
      if (syncSuccess) {
        await postTransactionForSchedule(schedule.id);
      }
    }
  }
}

// ── Internal Helpers ─────────────────────────────────────────────

async function getSchedulesWithTransactions(schedules: Schedule[]): Promise<Set<string>> {
  if (schedules.length === 0) return new Set();

  const ids = schedules.map((s) => s.id);
  const placeholders = ids.map(() => "?").join(",");
  const rows = await runQuery<{ schedule: string }>(
    `SELECT DISTINCT schedule FROM transactions
     WHERE schedule IN (${placeholders}) AND tombstone = 0`,
    ids,
  );
  return new Set(rows.map((r) => r.schedule));
}

async function updateScheduleMetadata(schedule: Partial<Schedule> & { id: string }): Promise<void> {
  const fields: Record<string, string | number | null> = {};

  if (schedule.name !== undefined) fields.name = schedule.name;
  if (schedule.completed !== undefined) fields.completed = schedule.completed ? 1 : 0;
  if (schedule.posts_transaction !== undefined)
    fields.posts_transaction = schedule.posts_transaction ? 1 : 0;

  if (Object.keys(fields).length === 0) return;

  await sendMessages(
    Object.entries(fields).map(([column, value]) => ({
      timestamp: Timestamp.send()!,
      dataset: "schedules",
      row: schedule.id,
      column,
      value,
    })),
  );
}

async function updateScheduleField(
  id: string,
  column: string,
  value: string | number | null,
): Promise<void> {
  await sendMessages([
    { timestamp: Timestamp.send()!, dataset: "schedules", row: id, column, value },
  ]);
}

/**
 * Merge old conditions with new schedule conditions.
 * Replaces matching fields and adds new ones.
 */
function mergeConditions(
  oldConditions: RuleCondition[],
  newConditions: RuleCondition[],
): RuleCondition[] {
  const oldConds = extractScheduleConds(oldConditions);
  const newConds = extractScheduleConds(newConditions);

  const pairs: [RuleCondition | null, RuleCondition | null][] = [
    [oldConds.payee, newConds.payee],
    [oldConds.account, newConds.account],
    [oldConds.amount, newConds.amount],
    [oldConds.date, newConds.date],
  ];

  const updated = oldConditions.map((cond) => {
    const match = pairs.find(([old]) => cond === old);
    return match && match[1] ? match[1] : cond;
  });

  const added = pairs.filter(([old, newC]) => old == null && newC != null).map(([, newC]) => newC!);

  return updated.concat(added);
}

/**
 * Update the schedules_json_paths table (local-only, not synced).
 */
async function updateJsonPaths(scheduleId: string, conditions: RuleCondition[]): Promise<void> {
  const conds = extractScheduleConds(conditions);

  const payeeIdx = conditions.findIndex((c) => c === conds.payee);
  const accountIdx = conditions.findIndex((c) => c === conds.account);
  const amountIdx = conditions.findIndex((c) => c === conds.amount);
  const dateIdx = conditions.findIndex((c) => c === conds.date);

  await run(
    `INSERT OR REPLACE INTO schedules_json_paths
       (schedule_id, payee, account, amount, date)
     VALUES (?, ?, ?, ?, ?)`,
    [
      scheduleId,
      payeeIdx === -1 ? null : `$[${payeeIdx}]`,
      accountIdx === -1 ? null : `$[${accountIdx}]`,
      amountIdx === -1 ? null : `$[${amountIdx}]`,
      dateIdx === -1 ? null : `$[${dateIdx}]`,
    ],
  );
}
