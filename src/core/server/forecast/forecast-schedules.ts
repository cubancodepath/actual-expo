/**
 * Expand schedules into future occurrences for the forecast. Port of
 * server/forecast/forecast-schedules.ts, reusing the recurrence engine
 * (recurrence-fns via server/util/rschedule), schedule normalization
 * (getSchedules), posted-dedup (posted.ts), rules engine (runRules), and
 * transfer resolution (getTransferAccount).
 */
import { runQuery } from "@/core/server/db";
import { getSchedules } from "@/core/server/schedules";
import { getScheduledAmount } from "@/core/shared/schedules";
import {
  recurConfigToRSchedule,
  getDateWithSkippedWeekend,
  parseDate,
  dayFromDate,
} from "@/core/shared/schedules";
import { RSchedule } from "@/core/server/util/rschedule";
import {
  indexPostedScheduleTransactions,
  isScheduleOccurrencePosted,
} from "@/core/shared/schedules";
import type { RecurConfig } from "@/core/types/models";
import type { RuleCondition } from "@/core/types/models";
import { getRules, applyRankedRules } from "@/core/server/transactions/transaction-rules";
import { getTransferAccount } from "@/core/server/transactions/transfer";
import type { AccountWithComputedBalance, ForecastScheduleOccurrence } from "@/core/types/models";

/** Synthetic account for schedules with no account. */
export const FORECAST_UNASSIGNED_ACCOUNT_ID = "__unassigned_schedule__";

/** Display label: resolved payee name, else the schedule name. */
function payeeDisplay(
  payee: unknown,
  payeeNames: Map<string, string>,
  scheduleName: string,
): string {
  return (typeof payee === "string" ? payeeNames.get(payee) : undefined) ?? scheduleName;
}

type NormalizedSchedule = {
  id: string;
  name: string | null;
  next_date: string;
  posts_transaction: boolean;
  _conditions: RuleCondition[];
  _payee: string | null;
  _account: string;
  _category: string | null;
  _amount: number;
  _date: string | RecurConfig;
};

export async function getNormalizedSchedules(): Promise<NormalizedSchedule[]> {
  const schedules = await getSchedules();
  const out: NormalizedSchedule[] = [];
  for (const s of schedules) {
    if (s.completed || s.tombstone) continue;
    if (s._amount == null || s._date == null || s.next_date == null) continue;
    out.push({
      id: s.id,
      name: s.name,
      next_date: s.next_date,
      posts_transaction: s.posts_transaction,
      _conditions: s._conditions,
      _payee: s._payee,
      _account: s._account ?? FORECAST_UNASSIGNED_ACCOUNT_ID,
      _category: s._category,
      _amount: getScheduledAmount(s._amount),
      _date: s._date,
    });
  }
  return out;
}

/** All occurrence date strings for a schedule up to (and including) endDate. */
export function getFutureOccurrenceDates(schedule: NormalizedSchedule, endDate: Date): string[] {
  if (typeof schedule._date === "string") {
    const single = parseDate(schedule._date);
    return single <= endDate ? [dayFromDate(single)] : [];
  }
  const config = schedule._date;
  const dates = [schedule.next_date];
  const seen = new Set(dates);

  // One bounded query instead of stepping day by day. The weekend skip runs
  // after the range filter, so it can push an occurrence past endDate — those
  // are dropped here, keeping the range closed as the forecast expects, and it
  // can also collapse a Saturday and a Sunday onto the same Monday.
  const occurrences = new RSchedule({ rrules: recurConfigToRSchedule(config) })
    .occurrences({ start: parseDate(schedule.next_date), end: endDate })
    .toArray();

  for (const { date } of occurrences) {
    const adjusted = config.skipWeekend
      ? getDateWithSkippedWeekend(date, config.weekendSolveMode ?? "after")
      : date;
    if (adjusted > endDate) continue;

    const day = dayFromDate(adjusted);
    if (seen.has(day)) continue;
    seen.add(day);
    dates.push(day);
  }
  return dates;
}

/** Payees whose transfer_acct is one of the given accounts (id → payee row). */
async function getTransferPayeesByAccountId(
  accountIds: string[],
): Promise<Map<string, { id: string }>> {
  if (accountIds.length === 0) return new Map();
  const rows = await runQuery<{ id: string; transfer_acct: string }>(
    `SELECT id, transfer_acct FROM payees
     WHERE tombstone = 0 AND transfer_acct IN (${accountIds.map(() => "?").join(",")})`,
    accountIds,
  );
  return new Map(rows.map((r) => [r.transfer_acct, { id: r.id }]));
}

/** Resolve display names for a set of payee ids. */
async function getPayeeNames(payeeIds: string[]): Promise<Map<string, string>> {
  if (payeeIds.length === 0) return new Map();
  const rows = await runQuery<{ id: string; name: string }>(
    `SELECT id, name FROM payees WHERE id IN (${payeeIds.map(() => "?").join(",")})`,
    payeeIds,
  );
  return new Map(rows.map((r) => [r.id, r.name]));
}

export async function buildFutureScheduleOccurrences(
  schedules: NormalizedSchedule[],
  endDateObj: Date,
  accountsById: Map<string, AccountWithComputedBalance>,
  postedTransactions: Array<{ schedule?: string | null; date: string }>,
): Promise<ForecastScheduleOccurrence[]> {
  const postedByScheduleId = indexPostedScheduleTransactions(postedTransactions);
  const rules = await getRules();
  const transferPayeesByAccountId = await getTransferPayeesByAccountId([...accountsById.keys()]);
  const payeeNames = await getPayeeNames([
    ...new Set(schedules.flatMap((s) => (s._payee ? [s._payee] : []))),
  ]);
  const transferAccountCache = new Map<string, string | null>();
  const occurrences: ForecastScheduleOccurrence[] = [];

  for (const schedule of schedules) {
    const scheduleName = schedule.name ?? "Unknown";

    for (const date of getFutureOccurrenceDates(schedule, endDateObj)) {
      if (
        isScheduleOccurrencePosted({
          schedule,
          scheduleId: schedule.id,
          occurrenceDate: date,
          postedTransactions: postedByScheduleId.get(schedule.id) ?? [],
        })
      ) {
        continue;
      }

      const base: Record<string, unknown> = {
        id: `forecast-${schedule.id}-${date}`,
        account: schedule._account,
        amount: schedule._amount,
        payee: schedule._payee,
        category: schedule._category,
        date,
        schedule: schedule.id,
        cleared: false,
      };
      const source = applyRankedRules(rules, base);
      const sourceAccount = source.account as string;
      occurrences.push({
        transaction: source,
        account: sourceAccount,
        date,
        amount: source.amount as number,
        payee: payeeDisplay(source.payee, payeeNames, scheduleName),
        scheduleId: schedule.id,
        scheduleName,
      });

      if (sourceAccount === FORECAST_UNASSIGNED_ACCOUNT_ID) continue;

      const payeeId = source.payee as string | null;
      if (!payeeId) continue;
      if (!transferAccountCache.has(payeeId)) {
        transferAccountCache.set(payeeId, await getTransferAccount(payeeId));
      }
      const transferAccountId = transferAccountCache.get(payeeId);
      if (!transferAccountId || transferAccountId === sourceAccount) continue;

      const reverse = transferPayeesByAccountId.get(sourceAccount);
      const mirror: Record<string, unknown> = {
        id: `${source.id}-transfer`,
        account: transferAccountId,
        amount: -(source.amount as number),
        payee: reverse?.id ?? null,
        category: null,
        date,
        transfer_id: source.id,
        schedule: schedule.id,
        cleared: false,
      };
      const transfer = applyRankedRules(rules, mirror);

      const srcAcc = accountsById.get(sourceAccount);
      const dstAcc = accountsById.get(transfer.account as string);
      if (srcAcc && dstAcc && srcAcc.offbudget === dstAcc.offbudget) {
        source.category = null;
        transfer.category = null;
      }
      source.transfer_id = transfer.id;

      occurrences.push({
        transaction: transfer,
        account: transfer.account as string,
        date,
        amount: transfer.amount as number,
        payee: payeeDisplay(transfer.payee, payeeNames, scheduleName),
        scheduleId: schedule.id,
        scheduleName,
      });
    }
  }

  return occurrences;
}
