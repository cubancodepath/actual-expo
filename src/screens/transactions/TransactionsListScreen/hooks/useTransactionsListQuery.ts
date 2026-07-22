import { useMemo } from "react";
import { q, type Query } from "@/core/queries";
import { addMonths } from "@/lib/date";
import { useTransactions } from "@/lib/hooks/useTransactions";
import type { TransactionsListContext } from "../types";

/**
 * Build the AQL query for a list context. Exported for the compile unit test.
 *
 * Category month filtering uses a date range: the expo AQL compiler has no
 * `$transform: "$month"` filter (upstream's approach) — string bounds are
 * converted to YYYYMMDD ints by the compiler's date input conversion.
 */
export function buildTransactionsListQuery(context: TransactionsListContext, month: string): Query {
  if (context.kind === "all") {
    return q("transactions").select(["*", "accountName"]);
  }
  if (context.kind === "account") {
    // Hide reconciled (locked) transactions when the account's showReconciled
    // pref is off — same filter form as upstream's account query.
    return q("transactions")
      .filter({
        acct: context.accountId,
        ...(context.showReconciled === false ? { reconciled: { $eq: false } } : {}),
      })
      .select(["*", "accountName"]);
  }
  return q("transactions")
    .filter({
      category: context.categoryId,
      date: { $gte: `${month}-01`, $lt: `${addMonths(month, 1)}-01` },
    })
    .select(["*", "accountName"]);
}

/**
 * Infinite transactions query for the list screen — account ledger or a
 * category's activity in a month. Default order (date desc) and pagination
 * come from `useTransactions`, which also refetches on sync events.
 */
export function useTransactionsListQuery(context: TransactionsListContext, month: string) {
  const query = useMemo(() => buildTransactionsListQuery(context, month), [context, month]);
  return useTransactions({ query });
}
