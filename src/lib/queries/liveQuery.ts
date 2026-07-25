/**
 * LiveQuery — a query that auto-refreshes when dependent tables change.
 *
 * Ported from Actual Budget's desktop-client LiveQuery pattern.
 * Subscribes to queryRegistry (fed by _applyAndRecord in batch.ts)
 * instead of sync-event listeners.
 *
 * @example
 * const live = liveQuery(q("categories").filter({ hidden: false }), {
 *   onData: (data) => setCategories(data),
 * });
 * // ... later:
 * live.unsubscribe();
 */

import type { Query } from "@/core/shared/query";
import { executeQuery } from "@/core/server/aql/execute";
import { getQueryDependencies } from "@/core/server/aql";
import { listen } from "@/core/server/sync/syncEvents";

let _nextId = 0;

export interface LiveQueryInstance<T> {
  /** Current data from the last query execution. */
  data: T[];
  /** Re-execute the query and notify listeners. */
  run(): Promise<void>;
  /** Update data locally without re-querying. Fires onData. */
  optimisticUpdate(fn: (data: T[]) => T[]): void;
  /** Stop listening for changes and clean up. */
  unsubscribe(): void;
}

export interface LiveQueryOptions<T> {
  onData: (data: T[], prev: T[] | null) => void;
  onError?: (err: Error) => void;
}

export function liveQuery<T = Record<string, unknown>>(
  query: Query,
  options: LiveQueryOptions<T>,
): LiveQueryInstance<T> {
  const id = `lq-${++_nextId}`;
  let data: T[] = [];
  let prevData: T[] | null = null;
  let dependencies: string[] = [];
  let inflightId = 0;
  let isUnsubscribed = false;
  let runScheduled = false;

  function scheduleRun() {
    if (runScheduled || isUnsubscribed) return;
    runScheduled = true;
    setTimeout(() => {
      runScheduled = false;
      run();
    }, 0);
  }

  // Subscribe to sync events — re-run when dependent tables change
  const unlisten = listen((event) => {
    if (isUnsubscribed) return;
    if (!("tables" in event)) return;
    const tables = new Set(event.tables);
    if (dependencies.some((d) => tables.has(d))) {
      scheduleRun();
    }
  });

  async function run() {
    if (isUnsubscribed) return;

    const currentId = ++inflightId;
    try {
      const result = await executeQuery<T>(query);
      // Ignore stale responses
      if (inflightId !== currentId || isUnsubscribed) return;

      prevData = data;
      data = result.data;
      dependencies = result.dependencies;
      options.onData(data, prevData);
    } catch (err) {
      if (inflightId !== currentId || isUnsubscribed) return;
      if (options.onError) {
        options.onError(err instanceof Error ? err : new Error(String(err)));
      } else if (__DEV__) {
        console.warn("[liveQuery] error:", err);
      }
    }
  }

  function optimisticUpdate(fn: (data: T[]) => T[]) {
    ++inflightId; // in-flight runs must not clobber the optimistic data
    prevData = data;
    data = fn(data);
    options.onData(data, prevData);
  }

  function unsubscribe() {
    isUnsubscribed = true;
    unlisten();
  }

  // Auto-start: seed dependencies from the full compiled query (base table +
  // joined tables), so writes to a joined table invalidate correctly even
  // before the first async run resolves. Then run.
  dependencies = getQueryDependencies(query.serialize());
  run();

  return {
    get data() {
      return data;
    },
    run,
    optimisticUpdate,
    unsubscribe,
  };
}
