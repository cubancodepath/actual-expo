import { useSyncedPref } from "@/shared/hooks/useSyncedPref";
import type { FeatureFlag } from "@/core/domain/preferences/featureFlags";

export function useFeatureFlag(name: FeatureFlag): boolean {
  const [value] = useSyncedPref(`flags.${name}`);
  return value === "true";
}
