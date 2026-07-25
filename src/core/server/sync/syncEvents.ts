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

export type SyncEventType = "start" | "applied" | "success" | "error" | "prefs-updated";

export type SyncEvent =
  | {
      /** "start" = sync starting, "applied" = local mutation, "success" = remote sync completed */
      type: "start" | "applied" | "success";
      /** Tables/datasets that changed */
      tables: string[];
    }
  | {
      /**
       * A sync attempt failed. Upstream shape (app.events 'sync'
       * {type:'error', subtype}): core reports, the app-layer
       * listenForSyncEvent owns the reaction policy (conflict dialog,
       * session teardown, badge). Core never rethrows to schedulers.
       */
      type: "error";
      subtype: string;
      meta?: unknown;
    }
  | {
      /**
       * Synced budget prefs changed (e.g. budgetName from a peer). Upstream
       * parity: applyMessages → prefs.savePrefs + connection.send
       * ('prefs-updated'); the app listener mirrors these into its stores.
       */
      type: "prefs-updated";
      prefs: Record<string, string | number | null>;
    };

type Listener = (event: SyncEvent) => void;

const listeners = new Set<Listener>();

// While a budget is being CREATED its file is not the active one — notifying
// listeners would make the old budget's mounted liveQueries/spreadsheet
// re-query the temporary connection (racing the close that follows → native
// SIGSEGV in expo-sqlite) and repaint old screens with the wrong budget's
// data. The create workflow mutes the bus for that window.
let muted = false;

export function setSyncEventsMuted(m: boolean): void {
  muted = m;
}

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
  if (muted) return;
  for (const fn of listeners) {
    fn(event);
  }
}
