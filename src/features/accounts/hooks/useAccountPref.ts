/**
 * useAccountPref — per-account boolean preference (synced to server).
 *
 * Mirrors Actual desktop's pattern: `hide-cleared-{accountId}`, `hide-reconciled-{accountId}`.
 * Backed by the synced preferences table so it persists across devices.
 */

import { useCallback } from "react";
import { useSyncedPrefs } from "@/shared/hooks/useSyncedPrefs";

export function useAccountPref(
  accountId: string | undefined,
  key: "hide-cleared" | "hide-reconciled",
): [boolean, () => void] {
  const prefKey = accountId ? `${key}-${accountId}` : key;
  const [value, setValue] = useSyncedPrefs(prefKey);

  const toggle = useCallback(() => {
    setValue(value === "true" ? "false" : "true");
  }, [value, setValue]);

  return [value === "true", toggle];
}
