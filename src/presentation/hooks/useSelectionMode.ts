/**
 * useSelectionMode — selection state for list screens.
 *
 * Extracted from useTransactionList to be reusable with any list.
 * Manages a Set of selected IDs with toggle/selectAll/exit.
 */

import { useCallback, useMemo, useState } from "react";

export interface UseSelectionModeResult<T extends { id: string }> {
  selectedIds: Set<string>;
  isSelectMode: boolean;
  toggle(id: string): void;
  selectAll(items: T[], filter?: (item: T) => boolean): void;
  enter(): void;
  exit(): void;
  reset(): void;
  /** Long-press handler: enters select mode + toggles the item. */
  longPress(id: string): void;
  /** Items from the provided array that are currently selected. */
  selectedItems(items: T[]): T[];
}

export function useSelectionMode<T extends { id: string }>(): UseSelectionModeResult<T> {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isSelectMode, setIsSelectMode] = useState(false);

  const toggle = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback((items: T[], filter?: (item: T) => boolean) => {
    const ids = new Set(
      (filter ? items.filter(filter) : items).map((item) => item.id),
    );
    setSelectedIds(ids);
  }, []);

  const enter = useCallback(() => setIsSelectMode(true), []);

  const exit = useCallback(() => {
    setIsSelectMode(false);
    setSelectedIds(new Set());
  }, []);

  const reset = useCallback(() => setSelectedIds(new Set()), []);

  const longPress = useCallback(
    (id: string) => {
      if (!isSelectMode) setIsSelectMode(true);
      toggle(id);
    },
    [isSelectMode, toggle],
  );

  const selectedItems = useCallback(
    (items: T[]) => items.filter((item) => selectedIds.has(item.id)),
    [selectedIds],
  );

  return { selectedIds, isSelectMode, toggle, selectAll, enter, exit, reset, longPress, selectedItems };
}
