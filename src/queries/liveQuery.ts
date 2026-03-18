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

import type { Query } from "./query";
import { executeQuery } from "./execute";
import { registerQuery, unregisterQuery } from "./queryRegistry";

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

  function updateDependencies(deps: string[]) {
    // Re-register with new dependencies if they changed
    if (deps.join(",") !== dependencies.join(",")) {
      dependencies = deps;
      registerQuery(id, dependencies, () => {
        if (!isUnsubscribed) run();
      });
    }
  }

  async function run() {
    if (isUnsubscribed) return;

    const currentId = ++inflightId;
    try {
      const result = await executeQuery<T>(query);
      // Ignore stale responses
      if (inflightId !== currentId || isUnsubscribed) return;

      prevData = data;
      data = result.data;
      updateDependencies(result.dependencies);
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
    prevData = data;
    data = fn(data);
    options.onData(data, prevData);
  }

  function unsubscribe() {
    isUnsubscribed = true;
    unregisterQuery(id);
  }

  // Auto-start: register with empty deps initially, run() will update
  registerQuery(id, [query.serialize().table], () => {
    if (!isUnsubscribed) run();
  });
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
