/**
 * React hooks for AQL live queries.
 *
 * @example
 * // Simple live query
 * const { data, isLoading } = useLiveQuery(
 *   () => q("categories").filter({ hidden: false }),
 *   [],
 * );
 *
 * // Paged live query (infinite scroll)
 * const { data, fetchNext, hasMore } = usePagedLiveQuery(
 *   () => q("transactions").filter({ acct: accountId }).orderBy({ date: "desc" }),
 *   [accountId],
 *   { pageSize: 25 },
 * );
 */

import { useEffect, useMemo, useRef, useState, type DependencyList } from "react";
import type { Query } from "@/queries/query";
import { liveQuery, type LiveQueryInstance } from "@/queries/liveQuery";
import { pagedQuery, type PagedQueryInstance } from "@/queries/pagedQuery";

// ---------------------------------------------------------------------------
// useLiveQuery
// ---------------------------------------------------------------------------

export interface UseLiveQueryResult<T> {
  data: T[] | null;
  isLoading: boolean;
  /** True after the first successful data fetch. Use to distinguish placeholder [] from real empty. */
  hasLoaded: boolean;
}

export function useLiveQuery<T = Record<string, unknown>>(
  makeQuery: () => Query | null,
  deps: DependencyList,
): UseLiveQueryResult<T> {
  const query = useMemo(makeQuery, deps);
  // Start with [] (not null) — matches Actual's placeholderData: [] pattern.
  // Components always receive an array, never null. No loading flash.
  const [data, setData] = useState<T[] | null>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const isUnmounted = useRef(false);

  useEffect(() => {
    isUnmounted.current = false;
    if (!query) {
      setData([]);
      setIsLoading(false);
      return;
    }

    const live: LiveQueryInstance<T> = liveQuery<T>(query, {
      onData: (newData) => {
        if (!isUnmounted.current) {
          setData(newData);
          setIsLoading(false);
          setHasLoaded(true);
        }
      },
      onError: (err) => {
        if (!isUnmounted.current) {
          setIsLoading(false);
          if (__DEV__) console.warn("[useLiveQuery] error:", err);
        }
      },
    });

    return () => {
      isUnmounted.current = true;
      live.unsubscribe();
    };
  }, [query]);

  return { data, isLoading, hasLoaded };
}

// ---------------------------------------------------------------------------
// usePagedLiveQuery
// ---------------------------------------------------------------------------

export interface UsePagedLiveQueryResult<T> {
  data: T[] | null;
  isLoading: boolean;
  isLoadingMore: boolean;
  fetchNext: () => Promise<void>;
  totalCount: number;
  hasMore: boolean;
  /** Access the underlying PagedQuery instance for optimisticUpdate, etc. */
  queryRef: React.RefObject<PagedQueryInstance<T> | null>;
}

export interface UsePagedLiveQueryOptions {
  pageSize?: number;
}

export function usePagedLiveQuery<T = Record<string, unknown>>(
  makeQuery: () => Query | null,
  deps: DependencyList,
  options?: UsePagedLiveQueryOptions,
): UsePagedLiveQueryResult<T> {
  const query = useMemo(makeQuery, deps);
  const pageSize = options?.pageSize ?? 50;

  const [data, setData] = useState<T[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const isUnmounted = useRef(false);
  const queryRef = useRef<PagedQueryInstance<T> | null>(null);

  useEffect(() => {
    isUnmounted.current = false;
    if (!query) {
      setData(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    const paged = pagedQuery<T>(query, {
      pageCount: pageSize,
      onData: (newData) => {
        if (!isUnmounted.current) {
          setData(newData);
          setIsLoading(false);
          setTotalCount(paged.totalCount);
          setHasMore(paged.hasMore);
          setIsLoadingMore(paged.isLoadingMore);
        }
      },
      onError: (err) => {
        if (!isUnmounted.current) {
          setIsLoading(false);
          if (__DEV__) console.warn("[usePagedLiveQuery] error:", err);
        }
      },
    });

    queryRef.current = paged;

    return () => {
      isUnmounted.current = true;
      queryRef.current = null;
      paged.unsubscribe();
    };
  }, [query, pageSize]);

  const fetchNext = useMemo(
    () => async () => {
      const paged = queryRef.current;
      if (!paged || isUnmounted.current) return;
      setIsLoadingMore(true);
      await paged.fetchNext();
      if (!isUnmounted.current) {
        setIsLoadingMore(false);
        setHasMore(paged.hasMore);
        setTotalCount(paged.totalCount);
      }
    },
    [],
  );

  return { data, isLoading, isLoadingMore, fetchNext, totalCount, hasMore, queryRef };
}
