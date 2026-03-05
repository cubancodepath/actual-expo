import { useCallback, useEffect, useRef, useState } from 'react';
import { useTheme } from '../providers/ThemeProvider';
import { fullSync } from '../../sync';

type UseRefreshControlOptions = {
  /** Screen-specific data reload. Runs AFTER fullSync() completes. */
  onRefresh?: () => Promise<void>;
  /** Skip fullSync and only run onRefresh. Defaults to true. */
  syncFirst?: boolean;
};

/**
 * Centralised pull-to-refresh hook.
 *
 * - Manages a **local** `refreshing` flag per screen (no cross-screen spinner leak).
 * - Calls `fullSync()` (which triggers `refreshAllStores()`) so the entire app updates.
 * - Optionally runs a screen-specific reload callback afterwards.
 */
export function useRefreshControl(options?: UseRefreshControlOptions) {
  const { onRefresh, syncFirst = true } = options ?? {};
  const [refreshing, setRefreshing] = useState(false);
  const isMountedRef = useRef(true);
  const isRefreshingRef = useRef(false);
  const { colors } = useTheme();

  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  const handleRefresh = useCallback(async () => {
    if (isRefreshingRef.current) return;
    isRefreshingRef.current = true;
    setRefreshing(true);

    try {
      if (syncFirst) {
        try {
          await fullSync();
        } catch {
          // fullSync already records the error in syncStore
        }
      }

      if (onRefresh) {
        await onRefresh();
      }
    } finally {
      if (isMountedRef.current) {
        setRefreshing(false);
      }
      isRefreshingRef.current = false;
    }
  }, [onRefresh, syncFirst]);

  return {
    refreshing,
    refreshControlProps: {
      refreshing,
      onRefresh: handleRefresh,
      tintColor: colors.primary,
      colors: [colors.primary] as string[],
    },
  };
}
