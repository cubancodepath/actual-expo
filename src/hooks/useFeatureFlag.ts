import { useCallback } from "react";
import { useSyncedPrefs } from "@/hooks/useSyncedPrefs";
import {
  flagKey,
  parseFlagValue,
  serializeFlagValue,
  type FeatureFlag,
} from "@/core/domain/preferences/featureFlags";

/** Upstream signature: desktop-client/src/hooks/useFeatureFlag.ts */
export function useFeatureFlag(name: FeatureFlag): boolean {
  const [value] = useSyncedPrefs(flagKey(name));
  return parseFlagValue(name, value || undefined);
}

export function useSetFeatureFlag(name: FeatureFlag): (enabled: boolean) => Promise<void> {
  const [, setValue] = useSyncedPrefs(flagKey(name));
  return useCallback((enabled: boolean) => setValue(serializeFlagValue(enabled)), [setValue]);
}
