/**
 * usePrivacyMode — read/toggle privacy mode (amounts masked as ••••• ).
 *
 * Backed by the synced pref `isPrivacyEnabled` (upstream-aligned: privacy syncs
 * across devices). A thin boolean convenience over `useSyncedPref`.
 *
 * @example
 * const [privacyMode, togglePrivacy] = usePrivacyMode();
 */
import { useCallback } from "react";
import { useSyncedPref } from "@/lib/hooks/useSyncedPref";

export function usePrivacyMode(): [boolean, () => void] {
  const [value, setValue] = useSyncedPref("isPrivacyEnabled");
  const enabled = value === "true";

  const toggle = useCallback(() => {
    void setValue(enabled ? "false" : "true");
  }, [enabled, setValue]);

  return [enabled, toggle];
}
