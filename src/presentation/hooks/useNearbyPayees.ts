/**
 * useNearbyPayees — nearby payees via React Query.
 *
 * Ported from Actual Budget's pattern: useQuery with staleTime: Infinity,
 * manually invalidated. No store — React Query manages the cache.
 */

import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useFeatureFlag } from "@/presentation/hooks/useSyncedPref";
import { getCurrentPosition } from "@/services/locationService";
import { getNearbyPayees } from "@/payee-locations";
import type { NearbyPayee } from "@/payee-locations/types";

const QUERY_KEY = ["payees", "nearby"] as const;

export function useNearbyPayees() {
  const [enabled] = useFeatureFlag("payeeLocations");
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<NearbyPayee[]>({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const coords = await getCurrentPosition();
      if (!coords) return [];
      return getNearbyPayees(coords);
    },
    enabled,
    staleTime: Infinity,
    placeholderData: [],
  });

  const refresh = useCallback(() => {
    if (!enabled) return;
    queryClient.invalidateQueries({ queryKey: QUERY_KEY });
  }, [enabled, queryClient]);

  return {
    nearbyPayees: data ?? [],
    loading: isLoading,
    refresh,
    enabled,
  };
}

/** Invalidate nearby payees cache (call after saving a location). */
export function invalidateNearbyPayees(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: QUERY_KEY });
}
