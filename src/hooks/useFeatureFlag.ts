import { useSyncedPref } from "../presentation/hooks/useSyncedPref";
import type { FeatureFlag } from "../preferences/featureFlags";

export function useFeatureFlag(name: FeatureFlag): boolean {
  const [value] = useSyncedPref(`flags.${name}`);
  return value === "true";
}
