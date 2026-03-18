/**
 * PagedQuery — LiveQuery with pagination support.
 *
 * Ported from Actual Budget's PagedQuery pattern.
 * Fetches data in pages, supports fetchNext() for infinite scroll,
 * and auto-refreshes when dependent tables change.
 *
 * @example
 * const paged = pagedQuery(q("transactions").orderBy({ date: "desc" }), {
 *   onData: (data) => setTransactions(data),
 *   pageCount: 50,
 * });
 * // Load next page on scroll:
 * paged.fetchNext();
 * // Cleanup:
 * paged.unsubscribe();
 */

import type { Query } from "./query";
import { executeQuery, executeCount } from "./execute";
import { listen } from "../sync/syncEvents";

let _nextId = 0;

export interface PagedQueryInstance<T> {
  /** Current loaded data (all pages concatenated). */
  data: T[];
  /** Total row count in the full dataset. */
  totalCount: number;
  /** Whether more pages are available. */
  hasMore: boolean;
  /** Whether a page fetch is in progress. */
  isLoadingMore: boolean;
  /** Re-execute the query (reloads up to current data length or pageCount). */
  run(): Promise<void>;
  /** Load the next page of results. */
  fetchNext(): Promise<void>;
  /** Update data locally without re-querying. Fires onData. */
  optimisticUpdate(fn: (data: T[]) => T[]): void;
  /** Stop listening for changes and clean up. */
  unsubscribe(): void;
}

export interface PagedQueryOptions<T> {
  onData: (data: T[], prev: T[] | null) => void;
  onPageData?: (page: T[]) => void;
  onError?: (err: Error) => void;
  pageCount?: number;
}

export function pagedQuery<T = Record<string, unknown>>(
  query: Query,
  options: PagedQueryOptions<T>,
): PagedQueryInstance<T> {
  const id = `pq-${++_nextId}`;
  const pageCount = options.pageCount ?? 50;

  let data: T[] = [];
  let prevData: T[] | null = null;
  let totalCount = 0;
  let hasMore = false;
  let isLoadingMore = false;
  let dependencies: string[] = [];
  let inflightId = 0;
  let fetchNextPromise: Promise<void> | null = null;
  let isUnsubscribed = false;

  // Subscribe to sync events — re-run when dependent tables change
  const unlisten = listen((event) => {
    if (isUnsubscribed) return;
    const tables = new Set(event.tables);
    if (dependencies.some((d) => tables.has(d))) {
      run();
    }
  });

  async function run() {
    if (isUnsubscribed) return;

    const currentId = ++inflightId;
    const limit = Math.max(data.length, pageCount);

    try {
      const [result, count] = await Promise.all([
        executeQuery<T>(query.limit(limit)),
        executeCount(query),
      ]);

      if (inflightId !== currentId || isUnsubscribed) return;

      prevData = data;
      data = result.data;
      totalCount = count;
      hasMore = data.length < totalCount;
      dependencies = result.dependencies;
      options.onData(data, prevData);
    } catch (err) {
      if (inflightId !== currentId || isUnsubscribed) return;
      if (options.onError) {
        options.onError(err instanceof Error ? err : new Error(String(err)));
      } else if (__DEV__) {
        console.warn("[pagedQuery] error:", err);
      }
    }
  }

  async function fetchNext() {
    if (isUnsubscribed || isLoadingMore || !hasMore) return;
    // Deduplicate concurrent fetchNext calls
    if (fetchNextPromise) return fetchNextPromise;

    fetchNextPromise = (async () => {
      isLoadingMore = true;
      try {
        const result = await executeQuery<T>(
          query.limit(pageCount).offset(data.length),
        );
        if (isUnsubscribed) return;

        if (result.data.length === 0) {
          hasMore = false;
        } else {
          prevData = data;
          data = [...data, ...result.data];
          hasMore = result.data.length >= pageCount;
          options.onPageData?.(result.data);
          options.onData(data, prevData);
        }
      } catch (err) {
        if (!isUnsubscribed && options.onError) {
          options.onError(err instanceof Error ? err : new Error(String(err)));
        }
      } finally {
        isLoadingMore = false;
        fetchNextPromise = null;
      }
    })();

    return fetchNextPromise;
  }

  function optimisticUpdate(fn: (data: T[]) => T[]) {
    const prevLen = data.length;
    prevData = data;
    data = fn(data);
    totalCount += data.length - prevLen;
    options.onData(data, prevData);
  }

  function unsubscribe() {
    isUnsubscribed = true;
    unlisten();
  }

  // Auto-start
  dependencies = [query.serialize().table];
  run();

  return {
    get data() { return data; },
    get totalCount() { return totalCount; },
    get hasMore() { return hasMore; },
    get isLoadingMore() { return isLoadingMore; },
    run,
    fetchNext,
    optimisticUpdate,
    unsubscribe,
  };
}
