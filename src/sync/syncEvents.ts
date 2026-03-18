/**
 * Sync event bus — centralized notification system for data changes.
 *
 * Ported from Actual Budget's sync-event pattern. All code that applies
 * changes (local mutations via batch.ts, remote sync via fullSync.ts)
 * emits events here. Consumers (storeRegistry, liveQuery) listen and
 * react to changes in tables they depend on.
 *
 * This replaces direct function calls and ensures every sync path
 * notifies all consumers uniformly.
 */

export type SyncEventType = "applied" | "success";

export type SyncEvent = {
  /** "applied" = local mutation, "success" = remote sync completed */
  type: SyncEventType;
  /** Tables/datasets that changed */
  tables: string[];
};

type Listener = (event: SyncEvent) => void;

const listeners = new Set<Listener>();

/**
 * Subscribe to sync events. Returns an unsubscribe function.
 */
export function listen(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/**
 * Emit a sync event to all listeners.
 */
export function emit(event: SyncEvent): void {
  for (const fn of listeners) {
    fn(event);
  }
}
