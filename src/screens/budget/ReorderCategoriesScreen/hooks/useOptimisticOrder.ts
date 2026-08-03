import { useCallback, useEffect, useRef, useState } from "react";
import { emitErrorEvent } from "@/lib/errors/ErrorChannel";

/**
 * Holds the order the list is currently showing, which during a drag is ahead of
 * the database.
 *
 * The drag library reorders its own cells and then expects `data` to agree; if it
 * doesn't, the row springs back. That makes local state mandatory rather than an
 * optimisation, and it puts this hook between two writers: the user's drops and
 * `liveQuery`, which re-derives the order from the database after every move.
 *
 * The rule is that `liveQuery` only wins while nothing is in flight. A move
 * writes several CRDT rows (the shove, then the row itself), so the derived order
 * would otherwise arrive mid-write and yank the row back to where it started for
 * a frame. Once the move resolves, local state and the database say the same
 * thing anyway — and if it *failed*, the catch below is what puts the row back.
 */
export function useOptimisticOrder<T>(derived: T[]) {
  const [rows, setRows] = useState(derived);
  // The last order the database gave us, for rolling back a failed move.
  const derivedRef = useRef(derived);
  derivedRef.current = derived;
  const isCommitting = useRef(false);

  useEffect(() => {
    if (!isCommitting.current) setRows(derived);
  }, [derived]);

  /**
   * Redraw in the order we already hold — for a drop that isn't allowed. The
   * array identity has to change or the list won't re-render, and the dragged
   * cell stays where the finger left it.
   */
  const revert = useCallback(() => setRows((current) => [...current]), []);

  /** Show `next` immediately, then persist. A failure rolls back to the database. */
  const commit = useCallback((next: T[], persist: () => Promise<void>) => {
    setRows(next);
    isCommitting.current = true;
    persist()
      .catch((e: unknown) => {
        emitErrorEvent(e);
        setRows([...derivedRef.current]);
      })
      .finally(() => {
        isCommitting.current = false;
      });
  }, []);

  return { rows, revert, commit };
}
