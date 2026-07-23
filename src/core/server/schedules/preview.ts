/**
 * Schedule preview orchestrator.
 *
 * The display-ready equivalent of Actual's `usePreviewTransactions` hook, but as
 * a core service (no React): it loads schedules, derives statuses, computes the
 * upcoming preview occurrences, runs the rule engine over each (so rule actions
 * — category, amount, splits — apply), and resolves display names. The UI layer
 * only has to call this and render the result.
 */

import { getSchedules } from "./index";
import { getStatus } from "@/core/shared/schedules";
import { getHasTransactionsQuery, type ScheduleStatuses } from "@/core/shared/schedules";
import { computePreviewTransactions, type PreviewTransaction } from "@/core/shared/schedules";
import type { Schedule } from "@/core/types/models";
import { executeQuery } from "@/core/queries";
import { getArbitraryPref } from "@/core/server/preferences";
import { getRules } from "@/core/server/rules";
import { runRulesWithSplits } from "@/core/server/transactions/transaction-rules";
import { getPayees } from "@/core/server/payees";
import { getCategories } from "@/core/server/budget";
import { getAccounts } from "@/core/server/accounts";

export type { PreviewTransaction, PreviewSubtransaction } from "@/core/shared/schedules";

/** Build the paid-status set from linked, date-bounded transactions. */
async function loadHasTrans(schedules: Schedule[]): Promise<Set<string>> {
  const query = getHasTransactionsQuery(schedules);
  if (!query) return new Set();
  const { data } = await executeQuery<{ schedule: string | null }>(query);
  const set = new Set<string>();
  for (const row of data) if (row.schedule) set.add(row.schedule);
  return set;
}

/**
 * Compute display-ready preview (upcoming) transactions for all schedules, with
 * rules applied and names resolved. Optionally filtered (e.g. by account).
 */
export async function getSchedulePreviews(
  filter?: (schedule: Schedule) => boolean,
): Promise<PreviewTransaction[]> {
  const schedules = await getSchedules();
  if (schedules.length === 0) return [];

  const upcomingLength = (await getArbitraryPref("upcomingScheduledTransactionLength")) ?? "7";
  const hasTrans = await loadHasTrans(schedules);

  const statuses: ScheduleStatuses = new Map(
    schedules.map((s) => [
      s.id,
      getStatus(
        s.next_date,
        s.completed,
        hasTrans.has(s.id),
        s.custom_upcoming_length ?? upcomingLength,
      ),
    ]),
  );

  const [payees, categories, accounts, rules] = await Promise.all([
    getPayees(),
    getCategories(),
    getAccounts(),
    getRules(),
  ]);
  const payeeNames = new Map(payees.map((p) => [p.id, p.name ?? ""]));
  const categoryNames = new Map(categories.map((c) => [c.id, c.name ?? ""]));
  const accountNames = new Map(accounts.map((a) => [a.id, a.name ?? ""]));

  const base = computePreviewTransactions(
    schedules,
    statuses,
    payeeNames,
    categoryNames,
    accountNames,
    upcomingLength,
    filter,
  );

  // Run the rule engine over each preview so rule actions apply (category,
  // amount, splits). Rules operate on raw ids/dates; re-resolve names after.
  return base.map((preview) => {
    const input: Record<string, unknown> = {
      id: preview.id,
      account: preview.account,
      payee: preview.payee,
      category: preview.category ?? null,
      amount: preview.amount,
      date: preview.dateStr,
      notes: null,
    };

    const applied = runRulesWithSplits(rules, input);

    const category = (applied.category as string | null) ?? preview.category ?? null;
    const payee = (applied.payee as string | null) ?? preview.payee;
    const amount = typeof applied.amount === "number" ? applied.amount : preview.amount;

    const rawSubs = applied.subtransactions as
      | Array<{ id?: string; amount?: number; category?: string | null }>
      | undefined;
    const subtransactions = rawSubs?.map((st) => ({
      id: `preview/${st.id ?? ""}`,
      amount: st.amount ?? 0,
      category: st.category ?? null,
      categoryName: st.category ? (categoryNames.get(st.category) ?? null) : null,
    }));

    return {
      ...preview,
      payee,
      payeeName: payee ? (payeeNames.get(payee) ?? preview.payeeName) : preview.payeeName,
      amount,
      category,
      categoryName: category ? (categoryNames.get(category) ?? null) : null,
      ...(subtransactions && subtransactions.length > 0 ? { subtransactions } : {}),
    };
  });
}
