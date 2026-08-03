/**
 * Last-known-good results per query, so a screen that mounts one of these
 * queries can paint real data on its very first frame.
 *
 * Two writers keep it truthful:
 * - bootstrap ({@link loadBudget}) seeds the core queries while the splash is up;
 * - every {@link liveQuery} run writes its result back, so whatever a mounted
 *   query learned is what the next mount starts from.
 *
 * And one eraser: an `applied` sync event drops every entry whose tables were
 * written. That covers the entry no mounted query is refreshing — without it the
 * cache would keep serving the bootstrap snapshot forever, which is exactly the
 * bug it used to have: reorder categories, re-enter a pushed screen, and the
 * first frame showed the old order before the live query corrected it.
 *
 * An entry is dropped rather than refreshed on invalidation: this module has no
 * business running queries, and a missing entry costs one loading frame while a
 * wrong one costs a lie.
 */

import { getQueryDependencies } from "@/core/server/aql";
import { listen } from "@/core/server/sync/syncEvents";

const cache = new Map<string, { data: unknown[]; dependencies: string[] }>();

/**
 * The key doubles as the query: it's `serializeAsString()`, so the tables the
 * entry depends on can be read back out of it. An unparseable key gets no
 * dependencies, which the invalidation below treats as "depends on everything".
 */
function dependenciesOf(key: string): string[] {
  try {
    return getQueryDependencies(JSON.parse(key));
  } catch {
    return [];
  }
}

export function setQueryCache(key: string, data: unknown[]): void {
  cache.set(key, { data, dependencies: dependenciesOf(key) });
}

/**
 * Get cached data for a query key.
 * Does NOT delete — components may remount and need the cache again.
 * Entries leave by invalidation (above) or on budget switch via clearQueryCache().
 */
export function getQueryCache(key: string): unknown[] | null {
  return cache.get(key)?.data ?? null;
}

/** Clear all cached data (called on budget switch). */
export function clearQueryCache(): void {
  cache.clear();
}

// Same bus the live queries re-run from, so the cache can never outlive the
// data it snapshots. Module-level: the bus is a plain listener set, and this
// module only loads on budget open anyway.
listen((event) => {
  // Local mutations ("applied") and landed remote syncs ("success") both carry
  // the written tables; "start" carries an empty list and must not evict —
  // nothing has changed yet, and it fires on every 60s poll.
  if (!("tables" in event) || event.tables.length === 0) return;
  const tables = new Set(event.tables);
  for (const [key, entry] of cache) {
    const stale = entry.dependencies.length === 0 || entry.dependencies.some((d) => tables.has(d));
    if (stale) cache.delete(key);
  }
});
