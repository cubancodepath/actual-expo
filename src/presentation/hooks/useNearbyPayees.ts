import { useCallback } from "react";
import { useFeatureFlagsStore } from "@/stores/featureFlagsStore";
import { usePayeeLocationsStore } from "@/stores/payeeLocationsStore";
import { getCurrentPosition } from "@/services/locationService";

export function useNearbyPayees() {
  const enabled = useFeatureFlagsStore((s) => s.payeeLocations);
  const nearbyPayees = usePayeeLocationsStore((s) => s.nearbyPayees);
  const loading = usePayeeLocationsStore((s) => s.loading);
  const loadNearby = usePayeeLocationsStore((s) => s.loadNearby);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    const coords = await getCurrentPosition();
    if (coords) await loadNearby(coords);
  }, [enabled, loadNearby]);

  return { nearbyPayees, loading, refresh, enabled };
}
