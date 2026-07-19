/**
 * Schedules module — CRUD operations for scheduled/recurring transactions.
 *
 * Follows the same pattern as transactions/index.ts:
 *   - Raw SQL via db helpers
 *   - Mutations via sendMessages() for CRDT sync
 *   - undoable() wrapper for undo support
 */

import { randomUUID } from "expo-crypto";
import { runQuery, first, run } from "@/core/db";
import { sendMessages, batchMessages } from "@/core/sync";
import { undoable } from "@/core/sync/undo";
import { Timestamp } from "@/core/crdt";
import { createRule, updateRule, deleteRule, getRuleById } from "../rules";
import {
  getNextOccurrence,
  getUpcomingDates as getUpcomingRecurDates,
  getDateWithSkippedWeekend,
  parseDate,
  dayFromDate,
} from "./recurrence";
import {
  extractScheduleConds,
  getStatus,
  getScheduledAmount,
  normalizeScheduleName,
  areConditionValuesEqual,
  areScheduleConditionsEqual,
  updateActions,
  scheduleIsRecurring,
} from "./helpers";
import { getArbitraryPref } from "../preferences";
import { getHasTransactionsQuery } from "./status";
import { executeQuery } from "@/core/queries";
import { emit as emitSyncEvent } from "@/core/sync/syncEvents";
import { todayStr, todayInt, intToStr, strToInt } from "@/lib/date";
import { addDays, startOfDay, isFriday, isWeekend, nextMonday } from "date-fns";
import type { Schedule, RuleCondition, RuleAction, RecurConfig, ScheduleStatus } from "./types";
import type { ScheduleRow, ScheduleNextDateRow } from "@/core/db/types";

export type { Schedule } from "./types";
export {
  getStatus,
  getScheduledAmount,
  getRecurringDescription,
  extractScheduleConds,
  getUpcomingDays,
  scheduleIsRecurring,
} from "./helpers";
export { getUpcomingDates as getUpcomingRecurDates } from "./recurrence";
export {
  getScheduleOccurrenceMatchStartDate,
  indexPostedScheduleTransactions,
  isScheduleOccurrencePosted,
} from "./posted";
export type { PostedScheduleTransaction, ScheduleOccurrenceMatchInput } from "./posted";
export { getHasTransactionsQuery, isForPreview } from "./status";
export type { ScheduleStatuses } from "./status";
export { computePreviewTransactions } from "./computePreview";
export type { PreviewTransaction, PreviewSubtransaction } from "./computePreview";
export { getSchedulePreviews } from "./preview";

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
    custom_upcoming_length: row.custom_upcoming_length ?? null,
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

  // Check for duplicate name (trimmed/normalized, matching Actual)
  const name = normalizeScheduleName(opts.schedule?.name);
  if (name) {
    if (await checkIfScheduleExists(name, scheduleId)) {
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
      value: name,
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

  if (schedule.rule) {
    throw new Error("You cannot change the rule of a schedule");
  }

  // Normalize + duplicate-name check (matches Actual).
  const scheduleFields = { ...schedule };
  if ("name" in scheduleFields) {
    scheduleFields.name = normalizeScheduleName(scheduleFields.name);
    if (scheduleFields.name && (await checkIfScheduleExists(scheduleFields.name, schedule.id))) {
      throw new Error("Cannot update schedules with the same name");
    }
  }

  if (conditions) {
    const { date: dateCond } = extractScheduleConds(conditions);
    if (dateCond && dateCond.value == null) {
      throw new Error("Date is required");
    }

    // Get the existing rule; self-heal a corrupt/missing rule rather than crash.
    const row = await first<{ rule: string }>(
      "SELECT rule FROM schedules WHERE id = ? AND tombstone = 0",
      [schedule.id],
    );
    let rule = row?.rule ? await getRuleById(row.rule) : null;
    if (!rule) {
      rule = await fixRuleForSchedule(schedule.id);
    }

    await batchMessages(async () => {
      // Serialize Rule class instances back to plain objects for merging/saving
      const oldConditions = rule!.conditions.map((c) =>
        typeof c.serialize === "function"
          ? (c.serialize() as unknown as RuleCondition)
          : (c as unknown as RuleCondition),
      );
      const existingActions = rule!.actions.map((a) =>
        typeof a.serialize === "function"
          ? (a.serialize() as unknown as RuleAction)
          : (a as unknown as RuleAction),
      );
      const newConditions = mergeConditions(oldConditions, conditions);

      // Actions: explicit param replaces set-actions (keeping link-schedule);
      // otherwise keep the amount `set` action in sync with the amount condition.
      const newActions =
        actions !== undefined
          ? [...existingActions.filter((a) => a.op === "link-schedule"), ...actions]
          : (updateActions(newConditions, existingActions) ?? undefined);

      await updateRule(rule!.id!, {
        conditions: newConditions,
        ...(newActions ? { actions: newActions } : {}),
      });

      // Reset next_date when forced, or when the account or date condition
      // changed (a closed→open account switch or a new date needs recompute).
      const stripType = (c?: RuleCondition) => {
        if (!c) return {};
        const { type: _t, ...rest } = c;
        return rest;
      };
      if (
        resetNextDate ||
        !areScheduleConditionsEqual(
          oldConditions.find((c) => c.field === "account"),
          newConditions.find((c) => c.field === "account"),
        ) ||
        !areConditionValuesEqual(
          stripType(oldConditions.find((c) => c.field === "date")),
          stripType(newConditions.find((c) => c.field === "date")),
        )
      ) {
        await setNextDate({
          id: schedule.id,
          conditions: newConditions,
          reset: true,
        });
      }

      await updateScheduleMetadata(scheduleFields);
    });

    await updateJsonPaths(schedule.id, conditions);
  } else {
    await batchMessages(async () => {
      if (resetNextDate) {
        await setNextDate({ id: schedule.id, reset: true });
      }
      await updateScheduleMetadata(scheduleFields);
    });
  }

  return schedule.id;
});

export const deleteSchedule = undoable(async function deleteSchedule(id: string): Promise<void> {
  const row = await first<{ rule: string }>("SELECT rule FROM schedules WHERE id = ?", [id]);

  await batchMessages(async () => {
    if (row?.rule) {
      // Force: we own this rule and are tearing down the schedule with it.
      await deleteRule(row.rule, { force: true });
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

/**
 * Build the fields for a schedule-posted transaction, running the general
 * rule set over the schedule's own conditions-derived category/payee first
 * (rules can override them, add notes, etc.) — matches upstream's
 * addTransactions() bulk path, which always runs rules on system-generated
 * transactions (only manually-typed form entries skip full rule
 * application; see rules/apply.ts::applyRulesToNewTransaction).
 */
async function buildScheduledTransactionFields(
  schedule: Schedule,
  date: number,
): Promise<import("../rules/apply").NewTransactionWithSplits> {
  const { getRules } = await import("../rules");
  const { applyRulesToNewTransactionWithSplits } = await import("../rules/apply");

  const amount = getScheduledAmount(schedule._amount);
  const rules = await getRules();
  return applyRulesToNewTransactionWithSplits(rules, {
    account: schedule._account!,
    date,
    amount,
    payee: schedule._payee ?? null,
    category: schedule._category ?? null,
    cleared: false,
  });
}

/**
 * Insert a schedule-posted transaction, materializing a split (parent + child
 * rows) when a matching rule produced `set-split-amount` children, otherwise a
 * single row. Child amounts from the rule engine are already signed.
 */
async function insertScheduledTransaction(
  result: import("../rules/apply").NewTransactionWithSplits,
  scheduleId: string,
): Promise<void> {
  const { addTransaction } = await import("../transactions");
  const { fields, subtransactions } = result;

  if (!subtransactions || subtransactions.length === 0) {
    await addTransaction({ ...fields, schedule: scheduleId });
    return;
  }

  const { batchMessages } = await import("@/core/sync");
  await batchMessages(async () => {
    const parentId = await addTransaction({
      ...fields,
      category: null,
      schedule: scheduleId,
      is_parent: true,
    });
    for (const sub of subtransactions) {
      await addTransaction({
        account: fields.account,
        date: fields.date,
        amount: sub.amount,
        payee: fields.payee ?? null,
        category: sub.category,
        notes: sub.notes,
        cleared: fields.cleared ?? false,
        is_child: true,
        parent_id: parentId,
      });
    }
  });
}

export const postTransactionForSchedule = undoable(async function postTransactionForSchedule(
  id: string,
): Promise<void> {
  const schedule = await getScheduleById(id);
  if (!schedule || !schedule._account) return;

  const date = schedule.next_date ? toDateRepr(schedule.next_date) : todayInt();
  const result = await buildScheduledTransactionFields(schedule, date);

  await insertScheduledTransaction(result, id);
});

export const postTransactionForScheduleToday = undoable(
  async function postTransactionForScheduleToday(id: string): Promise<void> {
    const schedule = await getScheduleById(id);
    if (!schedule || !schedule._account) return;

    const result = await buildScheduledTransactionFields(schedule, todayInt());

    await insertScheduledTransaction(result, id);
  },
);

// ── Advance Schedules Service ────────────────────────────────────

/**
 * Check all active schedules and advance/post as needed.
 * Called after each sync (both success and failure).
 */
/** Whether a schedule's date is a recurrence config. Mirrors isRecurringSchedule. */
function isRecurringSchedule(schedule: Schedule): boolean {
  return (
    schedule._date != null && typeof schedule._date === "object" && "frequency" in schedule._date
  );
}

/** True if the schedule already has a posted transaction for its current occurrence. */
async function hasTransactionForSchedule(schedule: Schedule): Promise<boolean> {
  const query = getHasTransactionsQuery([schedule]);
  if (!query) return false;
  const { data } = await executeQuery<{ schedule: string | null }>(query);
  return data.filter(Boolean).some((row) => row.schedule === schedule.id);
}

/**
 * Advance a recurring schedule to the occurrence after its current next_date.
 * Returns the reloaded schedule, or null if it didn't move (exhausted/corrupt).
 */
async function advanceRecurringScheduleFromNextDate(schedule: Schedule): Promise<Schedule | null> {
  if (!isRecurringSchedule(schedule)) return null;

  const previousNextDate = schedule.next_date;
  try {
    await setNextDate({
      id: schedule.id,
      start: (nextDate) => addDays(parseDate(nextDate), 1),
    });
  } catch {
    // Corrupt rule — can't find it; give up on this schedule.
    return null;
  }

  const updated = await getScheduleById(schedule.id);
  if (updated == null || updated.next_date === previousNextDate) return null;
  return updated;
}

/**
 * Move all paid/due/missed schedules forward, auto-posting where configured.
 * Faithful port of Actual's advanceSchedulesService: uses the upcoming-length
 * preference (and per-schedule custom length), skips closed accounts, and
 * catches up multiple missed occurrences in a loop.
 */
export async function advanceSchedules(syncSuccess: boolean): Promise<void> {
  const all = await getSchedules();
  const closed = await getClosedAccountIds();
  const schedules = all.filter((s) => !s.completed && !(s._account && closed.has(s._account)));

  // Date-bounded "has posted transaction" set (drives "paid" status).
  const hasTrans = new Set<string>();
  const query = getHasTransactionsQuery(schedules);
  if (query) {
    const { data } = await executeQuery<{ schedule: string | null }>(query);
    for (const row of data) {
      if (row.schedule) hasTrans.add(row.schedule);
    }
  }

  const upcomingLength = (await getArbitraryPref("upcomingScheduledTransactionLength")) ?? "7";

  let failedToPost = false;
  let didPost = false;

  for (const schedule of schedules) {
    const status = getStatus(
      schedule.next_date,
      schedule.completed,
      hasTrans.has(schedule.id),
      schedule.custom_upcoming_length ?? upcomingLength,
    );

    if (
      schedule.posts_transaction &&
      schedule._account &&
      (status !== "paid" || isRecurringSchedule(schedule)) &&
      (status === "paid" || status === "due" || status === "missed")
    ) {
      let currentSchedule: Schedule | null = schedule;
      let currentStatus: ScheduleStatus = status;

      while (
        currentSchedule &&
        currentSchedule.posts_transaction &&
        currentSchedule._account &&
        (currentStatus === "paid" || currentStatus === "due" || currentStatus === "missed")
      ) {
        if (currentStatus === "paid") {
          const updated = await advanceRecurringScheduleFromNextDate(currentSchedule);
          if (updated == null) break;
          currentSchedule = updated;
          currentStatus = getStatus(
            currentSchedule.next_date,
            currentSchedule.completed,
            await hasTransactionForSchedule(currentSchedule),
            currentSchedule.custom_upcoming_length ?? upcomingLength,
          );
          continue;
        }

        // due / missed → auto-post (only after a successful sync)
        if (syncSuccess) {
          await postTransactionForSchedule(currentSchedule.id);
          didPost = true;
        } else {
          failedToPost = true;
          break;
        }

        if (!isRecurringSchedule(currentSchedule)) break;

        const updated = await advanceRecurringScheduleFromNextDate(currentSchedule);
        if (updated == null) break;
        currentSchedule = updated;
        currentStatus = getStatus(
          currentSchedule.next_date,
          currentSchedule.completed,
          await hasTransactionForSchedule(currentSchedule),
          currentSchedule.custom_upcoming_length ?? upcomingLength,
        );
      }
    } else if (status === "paid") {
      if (schedule._date) {
        if (isRecurringSchedule(schedule)) {
          // Move forward recurring schedules
          try {
            await setNextDate({ id: schedule.id });
          } catch {
            // Corrupt rule — skip
          }
        } else if (typeof schedule._date === "string" && schedule._date < todayStr()) {
          // Complete any past single schedules
          await updateSchedule({ schedule: { id: schedule.id, completed: true } });
        }
      }
    }
  }

  // A post simulates transactions arriving from a full sync; force a refresh.
  if (didPost && !failedToPost) {
    emitSyncEvent({ type: "success", tables: ["transactions"] });
  }
}

/** Ids of closed (non-tombstoned) accounts — schedules on these are not advanced. */
async function getClosedAccountIds(): Promise<Set<string>> {
  const rows = await runQuery<{ id: string }>(
    "SELECT id FROM accounts WHERE closed = 1 AND tombstone = 0",
  );
  return new Set(rows.map((r) => r.id));
}

// ── Internal Helpers ─────────────────────────────────────────────

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

/** Whether a (non-tombstoned) schedule already uses `name`, excluding `scheduleId`. */
async function checkIfScheduleExists(
  name: string,
  scheduleId: string | undefined,
): Promise<boolean> {
  const row = await first<{ id: string }>(
    "SELECT id FROM schedules WHERE tombstone = 0 AND name = ?",
    [name],
  );
  if (row == null) return false;
  if (scheduleId) return row.id !== scheduleId;
  return true;
}

/**
 * Recreate a fresh linked rule for a schedule whose rule got corrupted/lost, so
 * the system never crashes on a schedule without a rule. Mirrors Actual's
 * fixRuleForSchedule. Returns the new rule.
 */
async function fixRuleForSchedule(id: string) {
  const row = await first<{ rule: string }>("SELECT rule FROM schedules WHERE id = ?", [id]);
  if (row?.rule) {
    // Take the bad rule out of the system so it never causes problems again.
    await deleteRule(row.rule, { force: true });
  }

  const newRuleId = await createRule({
    conditionsOp: "and",
    conditions: [
      { op: "isapprox", field: "date", value: todayStr() },
      { op: "isapprox", field: "amount", value: 0 },
    ],
    actions: [{ op: "link-schedule", value: id }],
  });

  await sendMessages([
    {
      timestamp: Timestamp.send()!,
      dataset: "schedules",
      row: id,
      column: "rule",
      value: newRuleId,
    },
  ]);

  const rule = await getRuleById(newRuleId);
  if (!rule) throw new Error("Failed to create replacement rule for schedule");
  return rule;
}

/** Rule ids of completed schedules (used to exclude them from payee rule counts). */
export async function getCompletedScheduleRuleIds(): Promise<string[]> {
  const rows = await runQuery<{ rule: string | null }>(
    "SELECT rule FROM schedules WHERE tombstone = 0 AND completed = 1",
  );
  return rows.map((r) => r.rule).filter((r): r is string => !!r);
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
