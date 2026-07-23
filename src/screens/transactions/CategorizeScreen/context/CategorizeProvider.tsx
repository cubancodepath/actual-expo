import { createContext, use, useCallback, useRef, useState, type ReactNode } from "react";
import { useRouter } from "expo-router";
import { useMutation } from "@tanstack/react-query";
import { updateTransaction } from "@/core/server/transactions";
import { loadTransactionWithSplitLines } from "@/screens/transactions/components/category-select/loadTransaction";
import { saveTransaction, type SaveTransactionInput } from "@/core/server/transactions/save";
import { emitErrorEvent } from "@/lib/errors/ErrorChannel";
import type { TransactionDisplay } from "@/core/types/models";
import type { CategoryRef, SplitLineForm } from "@/ui/entity-select/types";

interface CategorizeContextValue {
  /** The transaction being categorized, loaded fresh by id. */
  txn: TransactionDisplay | null;
  /** Its current split lines when it is a parent (seeds the split editor). */
  existingSplitLines: SplitLineForm[];
  isLoading: boolean;
  /** Idempotent; called once by the index leaf with ITS route params. */
  initialize: (transactionId: string) => void;
  /** Return channel for the add-category subscreen. */
  pendingCategory: CategoryRef | null;
  setPendingCategory: (c: CategoryRef | null) => void;
  /** Assign a single category and close the flow. */
  applyCategory: (category: CategoryRef) => void;
  /** Replace the transaction's splits with `lines` and close the flow. */
  applySplit: (lines: SplitLineForm[]) => void;
  isApplying: boolean;
}

const CategorizeContext = createContext<CategorizeContextValue | null>(null);

/**
 * State for the categorize modal stack (picker → split-amounts → add-category):
 * loads the target transaction and owns the apply mutations, giving the flow
 * pick → apply → close semantics without mounting the transaction-form provider.
 * Mirrors the transaction stack's pattern: the LEAF reads route params and calls
 * `initialize` (this layout-mounted provider must not read them itself).
 */
export function CategorizeProvider({ children }: { children: ReactNode }) {
  const router = useRouter();

  const [txn, setTxn] = useState<TransactionDisplay | null>(null);
  const [existingSplitLines, setExistingSplitLines] = useState<SplitLineForm[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingCategory, setPendingCategory] = useState<CategoryRef | null>(null);

  const initializedRef = useRef(false);
  const initialize = useCallback((transactionId: string) => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    void (async () => {
      try {
        const { txn: loaded, splitLines } = await loadTransactionWithSplitLines(transactionId);
        if (!loaded) return;
        setTxn(loaded);
        setExistingSplitLines(splitLines);
      } catch (e) {
        emitErrorEvent(e, { operation: "transaction.categorize.load" });
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  // Errors are reported to the bus by the global MutationCache.onError.
  const categoryMutation = useMutation({
    mutationFn: ({ txnId, category }: { txnId: string; category: CategoryRef }) =>
      updateTransaction(txnId, { category: category.id }),
    onSuccess: () => router.dismiss(),
  });

  const splitMutation = useMutation({
    mutationFn: (input: SaveTransactionInput) => saveTransaction(input),
    onSuccess: () => router.dismiss(),
  });

  const { mutate: mutateCategory } = categoryMutation;
  const applyCategory = useCallback(
    (category: CategoryRef) => {
      if (!txn) return;
      mutateCategory({ txnId: txn.id, category });
    },
    [txn, mutateCategory],
  );

  const { mutate: mutateSplit } = splitMutation;
  const applySplit = useCallback(
    (lines: SplitLineForm[]) => {
      if (!txn) return;
      mutateSplit({
        transactionId: txn.id,
        account: txn.account,
        date: txn.date,
        amount: Math.abs(txn.amount),
        type: txn.amount < 0 ? "expense" : "income",
        payeeId: txn.payee,
        payeeName: txn.payeeName ?? "",
        categoryId: null,
        notes: txn.notes,
        cleared: txn.cleared,
        splitCategories: lines,
      });
    },
    [txn, mutateSplit],
  );

  const value: CategorizeContextValue = {
    txn,
    existingSplitLines,
    isLoading,
    initialize,
    pendingCategory,
    setPendingCategory,
    applyCategory,
    applySplit,
    isApplying: categoryMutation.isPending || splitMutation.isPending,
  };

  return <CategorizeContext.Provider value={value}>{children}</CategorizeContext.Provider>;
}

export function useCategorize(): CategorizeContextValue {
  const ctx = use(CategorizeContext);
  if (!ctx) throw new Error("useCategorize must be used within CategorizeProvider");
  return ctx;
}
