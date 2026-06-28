/**
 * Sync event bus — centralized notification system for data changes.
 *
 * Ported from Actual Budget's sync-event pattern. All code that applies
 * changes (local mutations via batch.ts, remote sync via fullSync.ts)
 * emits events here. Consumers (liveQuery, pagedQuery, spreadsheet,
 * useSyncedPref, useTransactions) listen and react to changes.
 *
 * This replaces direct function calls and ensures every sync path
 * notifies all consumers uniformly.
 */

export type SyncEventType = "start" | "applied" | "success" | "error";

export type SyncEvent = {
  /** "start" = sync starting, "applied" = local mutation, "success" = remote sync completed, "error" = sync failed */
  type: SyncEventType;
  /** Tables/datasets that changed */
  tables: string[];
  /** Error subtype: out-of-sync, network, clock-drift, encrypt-failure, decrypt-failure */
  subtype?: string;
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
