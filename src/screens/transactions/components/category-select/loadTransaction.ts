import { getChildTransactions, getTransactionById } from "@/core/server/transactions";
import type { TransactionDisplay } from "@/core/types/models";
import type { SplitLineForm } from "@/ui/entity-select/types";

/**
 * Load a transaction plus its split lines (children mapped to the form/editor
 * shape, empty for non-parents). Shared by every flow that hydrates a split
 * editor from an existing transaction (edit form, categorize).
 */
export async function loadTransactionWithSplitLines(
  transactionId: string,
): Promise<{ txn: TransactionDisplay | null; splitLines: SplitLineForm[] }> {
  const txn = await getTransactionById(transactionId);
  if (!txn) return { txn: null, splitLines: [] };
  if (!txn.is_parent) return { txn, splitLines: [] };
  const children = await getChildTransactions(transactionId);
  return {
    txn,
    splitLines: children.map((c) => ({
      id: c.id,
      categoryId: c.category,
      categoryName: c.categoryName ?? "",
      amount: Math.abs(c.amount),
    })),
  };
}
