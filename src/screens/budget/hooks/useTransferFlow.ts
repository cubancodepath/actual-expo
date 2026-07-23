import { useCallback, useEffect, useState } from "react";
import { useRouter } from "expo-router";
import { transferAvailable, transferMultipleCategories } from "@/core/server/budget/actions";
import { batchMessages } from "@/core/sync/batch";
import { TO_BUDGET_ID } from "@/screens/budget/constants";
import { useBudgetUIStore } from "@/stores/budgetUIStore";
import { useAmountKeyboardAvoidance } from "@/ui/amount-keyboard";

/** Which way money flows relative to the category the flow was opened for. */
export type TransferDirection = "to" | "from";

/** One counterpart of the transfer, and how much of it moves. */
export interface TransferEntry {
  id: string;
  name: string;
  /** The counterpart's available balance in cents when it was picked. */
  balance: number;
  /** Cents moved between this counterpart and the target category. */
  amount: number;
}

interface TransferFlowOptions {
  catId: string;
  catName: string;
  /** Signed balance of the category the flow was opened for. */
  balanceCents: number;
  direction: TransferDirection;
  /** Heading for the picker sheet — the picker knows nothing about this flow. */
  pickerTitle: string;
}

/**
 * The shared machinery behind the transfer sheets (cover-overspent, move-money):
 * the counterpart list, the picker round-trip, the in-app amount pad, and the
 * batched write. The two screens differ only in their direction, their hero and
 * their labels — everything below that lives here.
 *
 * `direction` is relative to the target category: `"to"` means money comes into
 * it (the counterparts fund it), `"from"` means it hands money out. Cover is
 * simply this flow with the direction pinned to `"to"`.
 */
export function useTransferFlow({
  catId,
  catName,
  balanceCents,
  direction,
  pickerTitle,
}: TransferFlowOptions) {
  const router = useRouter();
  const month = useBudgetUIStore((s) => s.month);
  const pickedCategory = useBudgetUIStore((s) => s.pickedCategory);
  const setPickedCategory = useBudgetUIStore((s) => s.setPickedCategory);

  const [entries, setEntries] = useState<TransferEntry[]>([]);
  const [saving, setSaving] = useState(false);

  const total = entries.reduce((sum, e) => sum + e.amount, 0);
  /** What the target category is left with once the transfer is applied. */
  const projected = balanceCents + (direction === "to" ? total : -total);

  // Per-row amount editing via the in-app pad — the pad writes the row's amount
  // directly (few rows), so the row chip and the hero amount stay live.
  const [editingId, setEditingId] = useState<string | null>(null);
  const closePad = useCallback(() => setEditingId(null), []);

  const { scrollRef, scrollProps, bottomPadding, scrollIntoView, onKeyboardHeightChange } =
    useAmountKeyboardAvoidance({
      basePadding: 96,
      editingPadding: 380,
      editing: editingId != null,
    });

  const onPressAmount = useCallback(
    (id: string, pageY: number) => {
      setEditingId(id);
      scrollIntoView(pageY);
    },
    [scrollIntoView],
  );

  const setEditingAmount = useCallback(
    (cents: number) => {
      setEntries((prev) => prev.map((e) => (e.id === editingId ? { ...e, amount: cents } : e)));
    },
    [editingId],
  );

  const handleAddCategory = useCallback(() => {
    closePad(); // don't leave the amount pad open under the picker sheet
    router.push({
      pathname: "/(auth)/budget/category-picker",
      params: {
        // The target is excluded like any already-picked counterpart: a category
        // can't be on both sides of its own transfer.
        excludeIds: [catId, ...entries.map((e) => e.id)].join(","),
        role: direction === "to" ? "funder" : "receiver",
        title: pickerTitle,
      },
    });
  }, [closePad, router, entries, catId, direction, pickerTitle]);

  // Open the picker shortly after mount when arriving with no counterparts yet.
  useEffect(() => {
    if (entries.length === 0) {
      const timer = setTimeout(() => handleAddCategory(), 500);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pick up the category chosen in the picker. Its amount defaults by one rule,
  // whichever way the money flows: cover what the RECEIVING side is missing,
  // capped by what the GIVING side has spare. Nothing missing (the receiver
  // isn't in the red) or nothing spare to give means no sensible default — the
  // row starts at zero and the user types it.
  useEffect(() => {
    if (!pickedCategory) return;
    const { catId: srcId, catName: srcName, balance: srcBalance } = pickedCategory;
    setPickedCategory(null);
    if (entries.some((e) => e.id === srcId)) return;
    const receiverBalance = direction === "to" ? projected : srcBalance;
    const giverBalance = direction === "to" ? srcBalance : projected;
    const amount = Math.min(Math.max(-receiverBalance, 0), Math.max(giverBalance, 0));
    setEntries((prev) => [...prev, { id: srcId, name: srcName, balance: srcBalance, amount }]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickedCategory]);

  /** Write every counterpart in one batch, then hand back to `onDone`. */
  const handleSave = useCallback(
    async (onDone: () => void) => {
      if (!catId || saving || total === 0) return;
      closePad();
      setSaving(true);
      try {
        const toBudget = entries.find((e) => e.id === TO_BUDGET_ID && e.amount > 0);
        const categories = entries.filter((e) => e.id !== TO_BUDGET_ID && e.amount > 0);

        // One batch = one undo step and one sync cycle for both counterpart kinds.
        await batchMessages(async () => {
          if (toBudget) {
            // Moving against the To Budget pool is just a budgeted-amount change
            // on the category: budget more to take from the pool, less to give back.
            await transferAvailable(
              month,
              catId,
              direction === "to" ? toBudget.amount : -toBudget.amount,
            );
          }
          if (categories.length > 0) {
            await transferMultipleCategories(
              month,
              catId,
              categories.map((e) => ({ categoryId: e.id, amountCents: e.amount, name: e.name })),
              direction,
              catName,
            );
          }
        });
        onDone();
      } finally {
        setSaving(false);
      }
    },
    [catId, catName, month, direction, entries, total, saving, closePad],
  );

  return {
    entries,
    total,
    projected,
    saving,
    handleAddCategory,
    handleSave,
    // Amount pad wiring
    editingId,
    closePad,
    onPressAmount,
    setEditingAmount,
    editingAmount: entries.find((e) => e.id === editingId)?.amount ?? 0,
    scrollRef,
    scrollProps,
    bottomPadding,
    onKeyboardHeightChange,
  };
}
