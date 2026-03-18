/**
 * Simple query cache for pre-loaded data.
 *
 * During bootstrap (while splash screen is visible), we pre-fetch core queries
 * and store results here. When useLiveQuery mounts, it consumes the cached data
 * as initialData — giving an instant first render with real data.
 *
 * Cache entries are consumed once (get + delete) so liveQuery takes over after.
 */

const cache = new Map<string, unknown[]>();

export function setQueryCache(key: string, data: unknown[]): void {
  cache.set(key, data);
}

/**
 * Get cached data for a query key.
 * Does NOT delete — components may remount and need the cache again.
 * Cache is cleared on budget switch via clearQueryCache().
 */
export function getQueryCache(key: string): unknown[] | null {
  return cache.get(key) ?? null;
}

/** Clear all cached data (called on budget switch). */
export function clearQueryCache(): void {
  cache.clear();
}
