/**
 * usePreviewTransactions — reactive preview (upcoming) transactions.
 *
 * Ported from Actual Budget's usePreviewTransactions pattern.
 * Derives previews from schedules + statuses + payee/category/account names via useMemo.
 * Fully reactive: changes to schedules or transactions auto-update previews.
 */

import { useMemo } from "react";
import { useSchedules } from "./useSchedules";
import { usePayees } from "./usePayees";
import { useCategories } from "./useCategories";
import { useAccounts } from "./useAccounts";
import {
  computePreviewTransactions,
  type PreviewTransaction,
} from "@core/schedules/computePreview";

export type { PreviewTransaction } from "@core/schedules/computePreview";

export function usePreviewTransactions(opts?: {
  accountId?: string;
  upcomingDays?: number;
}): PreviewTransaction[] {
  const { schedules, statuses } = useSchedules();
  const { payees } = usePayees();
  const { categories } = useCategories();
  const { accounts } = useAccounts();

  const payeeNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of payees) map.set(p.id, p.name);
    return map;
  }, [payees]);

  const categoryNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of categories) map.set(c.id, c.name);
    return map;
  }, [categories]);

  const accountNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of accounts) map.set(a.id, a.name);
    return map;
  }, [accounts]);

  return useMemo(
    () =>
      computePreviewTransactions(
        schedules,
        statuses,
        payeeNames,
        categoryNames,
        accountNames,
        opts?.upcomingDays ?? 7,
        opts?.accountId ? (s) => s._account === opts.accountId : undefined,
      ),
    [
      schedules,
      statuses,
      payeeNames,
      categoryNames,
      accountNames,
      opts?.accountId,
      opts?.upcomingDays,
    ],
  );
}
