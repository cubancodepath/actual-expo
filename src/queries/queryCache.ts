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
 * Get and consume cached data for a query key.
 * Returns null if no cache exists. Deletes the entry after reading.
 */
export function consumeQueryCache(key: string): unknown[] | null {
  const data = cache.get(key);
  if (data !== undefined) {
    cache.delete(key);
    return data;
  }
  return null;
}

/** Clear all cached data (called on budget switch). */
export function clearQueryCache(): void {
  cache.clear();
}
