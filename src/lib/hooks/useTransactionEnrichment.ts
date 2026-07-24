/**
 * useTransactionEnrichment — joins payee/category/account names and transfer
 * flags onto raw transaction rows IN MEMORY, the way upstream does it (the AQL
 * schema/views carry no display names). Also normalizes the AQL `date` string
 * back to the YYYYMMDD integer the transaction UI is built around.
 *
 * The lookup maps come from `useAccounts`/`usePayees`/`useCategories`, which are
 * already loaded + cached at budget open, so this adds no new data to memory —
 * just an O(1) enrichment per row (lists are paginated).
 */
import { useCallback, useMemo } from "react";
import { useAccounts } from "@/lib/hooks/useAccounts";
import { usePayees } from "@/lib/hooks/usePayees";
import { useCategories } from "@/lib/hooks/useCategories";
import { strToInt } from "@/core/shared/months";
import type { Account, Payee, Category } from "@/core/types/models";
import type { Transaction, TransactionDisplay } from "@/core/types/models/transaction";

/** A raw transaction row as it comes back from AQL (date is a string). */
type RawTransactionRow = Omit<Transaction, "date"> & { date: string | number };

export function useTransactionEnrichment() {
  const { accounts } = useAccounts();
  const { payees } = usePayees();
  const { categories } = useCategories();

  const maps = useMemo(() => {
    const accountById = new Map<string, Account>(accounts.map((a) => [a.id, a]));
    const payeeById = new Map<string, Payee>(payees.map((p) => [p.id, p]));
    const categoryById = new Map<string, Category>(categories.map((c) => [c.id, c]));
    return { accountById, payeeById, categoryById };
  }, [accounts, payees, categories]);

  const enrichOne = useCallback(
    (row: RawTransactionRow): TransactionDisplay => {
      const { accountById, payeeById, categoryById } = maps;

      const payee = row.payee ? payeeById.get(row.payee) : undefined;
      const transferAccount = payee?.transfer_acct
        ? accountById.get(payee.transfer_acct)
        : undefined;
      const ownAccount = row.account ? accountById.get(row.account) : undefined;
      const category = row.category ? categoryById.get(row.category) : undefined;

      const date = typeof row.date === "number" ? row.date : (strToInt(row.date) ?? 0);

      return {
        ...(row as Transaction),
        date,
        // COALESCE(transferAccount.name, payee.name) — a transfer payee shows
        // its destination account's name.
        payeeName: transferAccount?.name ?? payee?.name ?? null,
        categoryName: category?.name ?? null,
        accountName: ownAccount?.name ?? null,
        isTransfer: payee?.transfer_acct != null,
        accountOffbudget: ownAccount?.offbudget ?? false,
        transferAccountOffbudget: transferAccount?.offbudget ?? false,
      };
    },
    [maps],
  );

  const enrich = useCallback(
    (rows: readonly RawTransactionRow[]): TransactionDisplay[] => rows.map(enrichOne),
    [enrichOne],
  );

  return { enrich, enrichOne };
}
