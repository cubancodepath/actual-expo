import { useCallback, useState } from "react";

/**
 * The split multi-select state machine: entering the mode, toggling ids, and
 * leaving it. Pure state, no JSX — lifted out of `CategorySelectView` so the
 * view is only presentation.
 */
export function useSplitSelection(seedId?: string | null) {
  const [splitMode, setSplitMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const toggleId = useCallback((id: string) => {
    setSelectedIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }, []);

  // Pre-seed the current single category so entering split costs one less tap.
  const enterSplit = useCallback(() => {
    setSplitMode(true);
    setSelectedIds(seedId ? [seedId] : []);
  }, [seedId]);

  const exitSplit = useCallback(() => {
    setSplitMode(false);
    setSelectedIds([]);
  }, []);

  return { splitMode, selectedIds, toggleId, enterSplit, exitSplit };
}
