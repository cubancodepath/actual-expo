import { useCallback, useEffect, useMemo, useState } from "react";
import {
  flattenSections,
  reflowByGroupOrder,
  toGroupRows,
  type ReorderGroupRowData,
  type ReorderRow,
} from "../lib/reorderModel";
import type { BudgetSection } from "@/screens/budget/hooks/useBudgetSections";

interface Draft {
  groups: ReorderGroupRowData[];
  categories: ReorderRow[];
  /** Whether anything has been moved since the last time this matched the database. */
  dirty: boolean;
}

export interface LocalOrder extends Draft {
  moveCategories: (next: ReorderRow[]) => void;
  moveGroups: (next: ReorderGroupRowData[]) => void;
  /** Redraw the same order — for a drop that isn't allowed. */
  revert: () => void;
  /** Go back to whatever the database says, and stop being dirty. */
  reset: () => void;
}

/**
 * The order the screen is showing, which is nobody's business but the screen's
 * until the user commits to it.
 *
 * Nothing here writes: a drag rearranges this array and that's all that happens,
 * so leaving without applying costs nothing and applying is a single
 * {@link applyCategoryOrder}. That's the whole reason this isn't the optimistic
 * layer it replaced — there is no write in flight to be optimistic about.
 *
 * While the user hasn't touched anything the list follows the database, so a
 * sync landing in the background is picked up. The moment they do, it stops:
 * re-seeding under a half-finished arrangement would throw their work away, and
 * a rearrangement they can still abandon is worth more than freshness. What
 * arrived is picked up on the next {@link reset}.
 */
export function useLocalOrder(sections: BudgetSection[]): LocalOrder {
  const baseGroups = useMemo(() => toGroupRows(sections), [sections]);
  const baseCategories = useMemo(() => flattenSections(sections), [sections]);

  const [draft, setDraft] = useState<Draft>(() => ({
    groups: baseGroups,
    categories: baseCategories,
    dirty: false,
  }));

  useEffect(() => {
    setDraft((current) => {
      if (current.dirty) return current;
      if (current.groups === baseGroups && current.categories === baseCategories) return current;
      return { groups: baseGroups, categories: baseCategories, dirty: false };
    });
  }, [baseGroups, baseCategories]);

  const moveCategories = useCallback((next: ReorderRow[]) => {
    setDraft((current) => ({ ...current, categories: next, dirty: true }));
  }, []);

  const moveGroups = useCallback((next: ReorderGroupRowData[]) => {
    setDraft((current) => ({
      groups: next,
      // The categories are off screen while the groups are being dragged, but
      // they're still the list the user will come back to — so they travel with
      // their group rather than being rebuilt from the database, which would
      // undo any category the user moved before opening group mode.
      categories: reflowByGroupOrder(
        current.categories,
        next.map((g) => g.id),
      ),
      dirty: true,
    }));
  }, []);

  // The array identity has to change or the list won't re-render, and the
  // dragged cell stays where the finger left it.
  const revert = useCallback(() => {
    setDraft((current) => ({ ...current, categories: [...current.categories] }));
  }, []);

  const reset = useCallback(() => {
    setDraft({ groups: baseGroups, categories: baseCategories, dirty: false });
  }, [baseGroups, baseCategories]);

  return { ...draft, moveCategories, moveGroups, revert, reset };
}
