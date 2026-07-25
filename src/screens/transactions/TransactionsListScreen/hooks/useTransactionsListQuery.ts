import { useMemo } from "react";
import { q, type Query } from "@/lib/queries";
import { addMonths } from "@/core/shared/months";
import { useTransactions } from "@/lib/hooks/useTransactions";
import { useTransactionEnrichment } from "@/lib/hooks/useTransactionEnrichment";
import type { TransactionsListContext } from "../types";

/**
 * Build the AQL query for a list context. Exported for the unit test. Display
 * names (payee/account/category) are joined in memory by `useTransactionEnrichment`,
 * so the query only selects the transaction's own fields.
 *
 * Category month filtering uses a date range (string bounds); the AQL compiler
 * converts them to YYYYMMDD ints on input.
 */
export function buildTransactionsListQuery(context: TransactionsListContext, month: string): Query {
  if (context.kind === "all") {
    return q("transactions").select("*");
  }
  if (context.kind === "account") {
    // Hide reconciled (locked) transactions when the account's showReconciled
    // pref is off — same filter form as upstream's account query.
    return q("transactions")
      .filter({
        account: context.accountId,
        ...(context.showReconciled === false ? { reconciled: { $eq: false } } : {}),
      })
      .select("*");
  }
  return q("transactions")
    .filter({
      category: context.categoryId,
      date: { $gte: `${month}-01`, $lt: `${addMonths(month, 1)}-01` },
    })
    .select("*");
}

/**
 * Infinite transactions query for the list screen — account ledger or a
 * category's activity in a month. Default order (date desc) and pagination
 * come from `useTransactions`, which also refetches on sync events.
 */
export function useTransactionsListQuery(context: TransactionsListContext, month: string) {
  const query = useMemo(() => buildTransactionsListQuery(context, month), [context, month]);
  const result = useTransactions({ query });
  const { enrich } = useTransactionEnrichment();
  const transactions = useMemo(() => enrich(result.transactions), [enrich, result.transactions]);
  return { ...result, transactions };
}
