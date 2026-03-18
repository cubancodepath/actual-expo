/**
 * Optimistic state engine for local-first mutations.
 *
 * Updates Zustand state in the current frame, then fires the real DB mutation
 * in the background. The existing storeRegistry refresh (triggered by
 * sendMessages → _applyAndRecord → refreshStoresForDatasets) overwrites the
 * optimistic state with DB truth once the write completes.
 *
 * No explicit rollback needed — local SQLite writes virtually never fail,
 * and if they do, the next store refresh or foreground sync corrects state.
 */

import type { StoreApi } from "zustand";

type Store<T> = {
  setState: StoreApi<T>["setState"];
  getState: StoreApi<T>["getState"];
};

/**
 * Apply an optimistic state update, then run the real mutation in background.
 *
 * @param store   - Zustand store (or any object with setState/getState)
 * @param updater - Pure function that returns the optimistic partial state
 * @param mutation - Async function that performs the real DB write
 */
export function optimistic<T>(
  store: Store<T>,
  updater: (state: T) => Partial<T>,
  mutation: () => Promise<void>,
): void {
  // 1. Instant: update Zustand state in the current frame
  store.setState(updater(store.getState()));

  // 2. Fire-and-forget: DB write + store refresh happens in background
  mutation().catch((err) => {
    if (__DEV__) console.warn("[optimistic] mutation failed, store will self-correct:", err);
  });
}
