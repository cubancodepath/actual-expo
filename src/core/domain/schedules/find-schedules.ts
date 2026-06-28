/**
 * find-schedules — auto-detect recurring transactions and suggest schedules.
 *
 * Port of loot-core/src/server/schedules/find-schedules.ts.
 * Scans each account's transaction history for weekly, bi-weekly, and monthly
 * patterns, ranks candidates by closeness to the predicted date, and returns
 * ready-to-create schedule objects.
 */

import {
  addDays,
  subDays,
  subWeeks,
  addWeeks,
  subMonths,
  differenceInDays,
  getDate,
  format,
} from "date-fns";
import { randomUUID } from "expo-crypto";

import { q } from "@/core/queries";
import { executeQuery } from "@/core/queries";
import { getApproxNumberThreshold } from "@/core/domain/rules/rule-utils";
import { parseDate, dayFromDate } from "./recurrence";
import { intToStr } from "@/lib/date";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RecurConfig = {
  start: string;
  frequency: "daily" | "weekly" | "monthly" | "yearly";
  interval?: number;
  patterns?: Array<{ type: string; value: number }>;
};

type Occurrence = {
  date: string;
  transactions: TransactionMatch[];
};

type TransactionMatch = {
  id: string;
  date: number;
  amount: number;
  payee: string | null;
  account: string;
};

type ScheduleCandidate = {
  rank: number;
  amount: number;
  account: string;
  payee: string | null;
  date: RecurConfig;
  exactDate: boolean;
  exactAmount: boolean;
};

type FoundSchedule = {
  id: string;
  account: string;
  payee: string | null;
  date: RecurConfig;
  amount: number;
  _conditions: Array<{
    op: string;
    field: string;
    value: unknown;
  }>;
};

// ---------------------------------------------------------------------------
// RSchedule integration (lazy-loaded same as rule-utils.ts)
// ---------------------------------------------------------------------------

let RScheduleClass: unknown = null;

async function ensureRSchedule() {
  if (RScheduleClass) return;
  try {
    await import("@rschedule/standard-date-adapter/setup");
    const { Schedule } = await import("@rschedule/core/generators");
    RScheduleClass = Schedule;
  } catch {
    // rschedule unavailable
  }
}

function recurConfigToRScheduleRules(config: RecurConfig): unknown[] {
  const start = parseDate(config.start);
  const frequency = config.frequency.toUpperCase();
  const base: Record<string, unknown> = { start, frequency, byHourOfDay: [12] };
  if (config.interval) base.interval = config.interval;

  if (config.frequency === "monthly" && config.patterns && config.patterns.length > 0) {
    const days = config.patterns.filter((p) => p.type === "day");
    const dayNames = config.patterns.filter((p) => p.type !== "day");
    const abbrev = (name: string) => name.slice(0, 2).toUpperCase();
    return [
      days.length > 0 && { ...base, byDayOfMonth: days.map((p) => p.value) },
      dayNames.length > 0 && {
        ...base,
        byDayOfWeek: dayNames.map((p) => [abbrev(p.type), p.value]),
      },
    ].filter(Boolean) as unknown[];
  }
  return [base];
}

function takeDates(config: RecurConfig): Date[] {
  if (!RScheduleClass) return [];
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ScheduleClass = RScheduleClass as any;
    const schedule = new ScheduleClass({ rrules: recurConfigToRScheduleRules(config) });
    return (
      schedule
        .occurrences({ take: 3 })
        .toArray()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((o: any) => o.date as Date)
    );
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Transaction lookup
// ---------------------------------------------------------------------------

async function getTransactions(date: Date, accountId: string): Promise<TransactionMatch[]> {
  const result = await executeQuery<TransactionMatch>(
    q("transactions")
      .filter({
        account: accountId,
        schedule: null,
        "payee.transfer_acct": null,
        $and: [
          { date: { $gte: intToStr(+format(subDays(date, 2), "yyyyMMdd")) } },
          { date: { $lte: intToStr(+format(addDays(date, 2), "yyyyMMdd")) } },
        ],
      })
      .select(["id", "date", "amount", "payee", "account"])
      .options({ splits: "none" }),
  );
  return result.data;
}

// ---------------------------------------------------------------------------
// Ranking
// ---------------------------------------------------------------------------

function getRank(day1: string, day2: string): number {
  const diff = Math.abs(differenceInDays(parseDate(day1), parseDate(day2)));
  return 1 / (diff + 1);
}

// ---------------------------------------------------------------------------
// Pattern matching
// ---------------------------------------------------------------------------

function matchSchedules(allOccurs: Occurrence[], config: RecurConfig): ScheduleCandidate[] {
  const reversed = [...allOccurs].reverse();
  const baseOccur = reversed[0];
  const others = reversed.slice(1);
  const candidates: ScheduleCandidate[] = [];

  for (const trans of baseOccur.transactions) {
    const threshold = getApproxNumberThreshold(trans.amount);

    const found = others.map((occur) => {
      let matched = occur.transactions.find(
        (t) => t.amount >= trans.amount - threshold && t.amount <= trans.amount + threshold,
      );
      matched = matched && matched.payee === trans.payee ? matched : undefined;
      if (matched) {
        return { trans: matched, rank: getRank(occur.date, dayFromDate(new Date(matched.date))) };
      }
      return null;
    });

    if (found.includes(null)) continue;

    const validFound = found as Array<{ trans: TransactionMatch; rank: number }>;

    const rank = validFound.reduce(
      (total, match) => total + match.rank,
      getRank(baseOccur.date, dayFromDate(new Date(trans.date))),
    );

    const exactAmount = validFound.every((m) => m.trans.amount === trans.amount);

    candidates.push({
      rank,
      amount: trans.amount,
      account: trans.account,
      payee: trans.payee,
      date: config,
      exactDate: rank === allOccurs.length,
      exactAmount,
    });
  }

  return candidates;
}

// ---------------------------------------------------------------------------
// Pattern scanners
// ---------------------------------------------------------------------------

async function schedulesForPattern(
  baseStart: Date,
  numDays: number,
  baseConfig: Partial<RecurConfig> | ((start: Date) => RecurConfig | false),
  accountId: string,
): Promise<ScheduleCandidate[]> {
  const candidates: ScheduleCandidate[] = [];

  for (let i = 0; i < numDays; i++) {
    const start = addDays(baseStart, i);
    let config: RecurConfig | false;

    if (typeof baseConfig === "function") {
      config = baseConfig(start);
      if (config === false) continue;
    } else {
      config = { ...(baseConfig as RecurConfig), start: dayFromDate(start) };
    }

    config.start = dayFromDate(parseDate(config.start));

    const dates = takeDates(config);
    const occurrences: Occurrence[] = [];

    for (const date of dates) {
      occurrences.push({
        date: dayFromDate(date),
        transactions: await getTransactions(date, accountId),
      });
    }

    candidates.push(...matchSchedules(occurrences, config));
  }

  return candidates;
}

async function weekly(startDate: string, accountId: string): Promise<ScheduleCandidate[]> {
  return schedulesForPattern(
    subWeeks(parseDate(startDate), 4),
    7 * 2,
    { frequency: "weekly" },
    accountId,
  );
}

async function every2weeks(startDate: string, accountId: string): Promise<ScheduleCandidate[]> {
  return schedulesForPattern(
    subWeeks(parseDate(startDate), 7),
    7 * 2,
    { frequency: "weekly", interval: 2 },
    accountId,
  );
}

async function monthly(startDate: string, accountId: string): Promise<ScheduleCandidate[]> {
  return schedulesForPattern(
    subMonths(parseDate(startDate), 4),
    31 * 2,
    (start) => {
      if (getDate(start) > 28) return false;
      return { start: dayFromDate(start), frequency: "monthly" };
    },
    accountId,
  );
}

async function monthlyLastDay(startDate: string, accountId: string): Promise<ScheduleCandidate[]> {
  const pattern = { frequency: "monthly" as const, patterns: [{ type: "day", value: -1 }] };
  const s1 = await schedulesForPattern(subMonths(parseDate(startDate), 3), 1, pattern, accountId);
  const s2 = await schedulesForPattern(subMonths(parseDate(startDate), 4), 1, pattern, accountId);
  return [...s1, ...s2];
}

async function monthly1stor3rd(startDate: string, accountId: string): Promise<ScheduleCandidate[]> {
  return schedulesForPattern(
    subWeeks(parseDate(startDate), 8),
    14,
    (start) => {
      const dayValue = format(new Date(), "iiii").slice(0, 2).toUpperCase();
      return {
        start: dayFromDate(start),
        frequency: "monthly",
        patterns: [
          { type: dayValue, value: 1 },
          { type: dayValue, value: 3 },
        ],
      };
    },
    accountId,
  );
}

async function monthly2ndor4th(startDate: string, accountId: string): Promise<ScheduleCandidate[]> {
  return schedulesForPattern(
    subMonths(parseDate(startDate), 8),
    14,
    (start) => {
      const dayValue = format(new Date(), "iiii").slice(0, 2).toUpperCase();
      return {
        start: dayFromDate(start),
        frequency: "monthly",
        patterns: [
          { type: dayValue, value: 2 },
          { type: dayValue, value: 4 },
        ],
      };
    },
    accountId,
  );
}

// ---------------------------------------------------------------------------
// Start date refinement
// ---------------------------------------------------------------------------

async function findStartDate(schedule: FoundSchedule): Promise<FoundSchedule> {
  const conditions = schedule._conditions;
  const dateCond = conditions.find((c) => c.field === "date");
  if (!dateCond) return schedule;

  let currentConfig = dateCond.value as RecurConfig;

  while (true) {
    const prevConfig = currentConfig;
    currentConfig = { ...prevConfig };

    switch (currentConfig.frequency) {
      case "weekly":
        currentConfig.start = dayFromDate(
          subWeeks(parseDate(currentConfig.start), currentConfig.interval ?? 1),
        );
        break;
      case "monthly":
        currentConfig.start = dayFromDate(
          subMonths(parseDate(currentConfig.start), currentConfig.interval ?? 1),
        );
        break;
      default:
        return schedule;
    }

    const newConditions = conditions.map((c) =>
      c.field === "date" ? { ...c, value: currentConfig } : c,
    );

    try {
      const { data } = await executeQuery(
        q("transactions")
          .filter({ $and: newConditions.map((c) => ({ [c.field]: { [`$${c.op}`]: c.value } })) })
          .select(["id"]),
      );

      if (data.length === 0) {
        currentConfig = prevConfig;
        break;
      }
    } catch {
      currentConfig = prevConfig;
      break;
    }
  }

  return {
    ...schedule,
    date: currentConfig,
    _conditions: conditions.map((c) => (c.field === "date" ? { ...c, value: currentConfig } : c)),
  };
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function findSchedules(): Promise<FoundSchedule[]> {
  await ensureRSchedule();

  const { data: accounts } = await executeQuery<{ id: string }>(
    q("accounts").filter({ closed: false }).select(["id"]),
  );

  let allCandidates: ScheduleCandidate[] = [];

  for (const account of accounts) {
    const { data: latest } = await executeQuery<{ date: number }>(
      q("transactions")
        .filter({ account: account.id, parent_id: null, tombstone: false })
        .orderBy({ date: "desc" })
        .limit(1)
        .select(["date"]),
    );

    if (latest.length === 0) continue;

    const latestDate = intToStr(latest[0].date);
    const dateStr =
      latestDate.slice(0, 4) + "-" + latestDate.slice(4, 6) + "-" + latestDate.slice(6, 8);

    allCandidates = allCandidates.concat(
      await weekly(dateStr, account.id),
      await every2weeks(dateStr, account.id),
      await monthly(dateStr, account.id),
      await monthlyLastDay(dateStr, account.id),
      await monthly1stor3rd(dateStr, account.id),
      await monthly2ndor4th(dateStr, account.id),
    );
  }

  // Group by payee, pick highest-ranked candidate per payee
  const byPayee = new Map<string | null, ScheduleCandidate[]>();
  for (const c of allCandidates) {
    const key = c.payee;
    const group = byPayee.get(key) ?? [];
    group.push(c);
    byPayee.set(key, group);
  }

  const schedules: FoundSchedule[] = [];
  for (const [, group] of byPayee) {
    group.sort((a, b) => b.rank - a.rank);
    const winner = group[0];

    schedules.push({
      id: randomUUID(),
      account: winner.account,
      payee: winner.payee,
      date: winner.date,
      amount: winner.amount,
      _conditions: [
        { op: "is", field: "account", value: winner.account },
        { op: "is", field: "payee", value: winner.payee },
        {
          op: winner.exactDate ? "is" : "isapprox",
          field: "date",
          value: winner.date,
        },
        {
          op: winner.exactAmount ? "is" : "isapprox",
          field: "amount",
          value: winner.amount,
        },
      ],
    });
  }

  const finalized: FoundSchedule[] = [];
  for (const s of schedules) {
    finalized.push(await findStartDate(s));
  }
  return finalized;
}
