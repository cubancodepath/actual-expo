import { useSyncedPrefs } from "@/hooks/useSyncedPrefs";
import type { FeatureFlag } from "@/core/domain/preferences/featureFlags";

export function useFeatureFlag(name: FeatureFlag): boolean {
  const [value] = useSyncedPrefs(`flags.${name}`);
  return value === "true";
}
