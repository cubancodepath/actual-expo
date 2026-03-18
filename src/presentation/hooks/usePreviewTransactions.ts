/**
 * usePreviewTransactions — reactive preview (upcoming) transactions.
 *
 * Ported from Actual Budget's usePreviewTransactions pattern.
 * Derives previews from schedules + statuses + payee names via useMemo.
 * Fully reactive: changes to schedules or transactions auto-update previews.
 */

import { useMemo } from "react";
import { useSchedules } from "./useSchedules";
import { usePayeesStore } from "@/stores/payeesStore";
import { computePreviewTransactions, type PreviewTransaction } from "@/schedules/computePreview";

export type { PreviewTransaction } from "@/schedules/computePreview";

export function usePreviewTransactions(opts?: {
  accountId?: string;
  upcomingDays?: number;
}): PreviewTransaction[] {
  const { schedules, statuses } = useSchedules();
  const payees = usePayeesStore((s) => s.payees);

  // Build payee name map from store (reactive — updates when payees change)
  const payeeNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of payees) {
      map.set(p.id, p.name);
    }
    return map;
  }, [payees]);

  return useMemo(
    () =>
      computePreviewTransactions(
        schedules,
        statuses,
        payeeNames,
        opts?.upcomingDays ?? 7,
        opts?.accountId ? (s) => s._account === opts.accountId : undefined,
      ),
    [schedules, statuses, payeeNames, opts?.accountId, opts?.upcomingDays],
  );
}
