import { useCallback, useRef, useState } from 'react';
import { useRefreshControl } from '../useRefreshControl';
import type { TransactionDisplay } from '../../../transactions';

const DEFAULT_PAGE_SIZE = 25;

interface UseTransactionPaginationOptions {
  fetchTransactions: (limit: number, offset: number) => Promise<TransactionDisplay[]>;
  pageSize?: number;
}

export function useTransactionPagination({
  fetchTransactions,
  pageSize = DEFAULT_PAGE_SIZE,
}: UseTransactionPaginationOptions) {
  const [transactions, setTransactions] = useState<TransactionDisplay[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const offsetRef = useRef(0);
  const refreshIdRef = useRef(0);
  const hasLoaded = useRef(false);

  // Use a ref so loadAll/silentRefresh/loadMore always call the latest fetchTransactions
  const fetchRef = useRef(fetchTransactions);
  fetchRef.current = fetchTransactions;

  const loadAll = useCallback(async () => {
    const id = ++refreshIdRef.current;
    setLoading(true);
    offsetRef.current = 0;
    try {
      const txns = await fetchRef.current(pageSize, 0);
      if (refreshIdRef.current !== id) return;
      setTransactions(txns);
      setHasMore(txns.length === pageSize);
      offsetRef.current = txns.length;
    } finally {
      setLoading(false);
    }
  }, [pageSize]);

  const silentRefresh = useCallback(async () => {
    const id = ++refreshIdRef.current;
    const count = Math.max(offsetRef.current, pageSize);
    const txns = await fetchRef.current(count, 0);
    if (refreshIdRef.current !== id) return;
    setTransactions(txns);
    setHasMore(txns.length === count);
    offsetRef.current = txns.length;
  }, [pageSize]);

  const loadMore = useCallback(async () => {
    if (loading || loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const txns = await fetchRef.current(pageSize, offsetRef.current);
      if (txns.length === 0) { setHasMore(false); return; }
      setTransactions(prev => [...prev, ...txns]);
      setHasMore(txns.length === pageSize);
      offsetRef.current += txns.length;
    } finally {
      setLoadingMore(false);
    }
  }, [loading, loadingMore, hasMore, pageSize]);

  const { refreshControlProps } = useRefreshControl({
    onRefresh: async () => {
      const id = ++refreshIdRef.current;
      const count = Math.max(offsetRef.current, pageSize);
      const txns = await fetchRef.current(count, 0);
      if (refreshIdRef.current !== id) return;
      setTransactions(txns);
      setHasMore(txns.length === count);
      offsetRef.current = txns.length;
    },
  });

  return {
    transactions,
    setTransactions,
    loading,
    loadingMore,
    hasMore,
    loadAll,
    silentRefresh,
    loadMore,
    refreshIdRef,
    hasLoaded,
    refreshControlProps,
  };
}
