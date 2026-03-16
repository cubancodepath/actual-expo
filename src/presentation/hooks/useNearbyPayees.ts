import { useCallback } from "react";
import { usePrefsStore } from "@/stores/prefsStore";
import { usePayeeLocationsStore } from "@/stores/payeeLocationsStore";
import { getCurrentPosition } from "@/services/locationService";

export function useNearbyPayees() {
  const enabled = usePrefsStore((s) => s.payeeLocationsEnabled);
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
