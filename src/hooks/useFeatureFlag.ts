import { useFeatureFlagsStore } from '../stores/featureFlagsStore';
import type { FeatureFlag } from '../preferences/featureFlags';

export function useFeatureFlag(name: FeatureFlag): boolean {
  return useFeatureFlagsStore((s) => s[name]);
}
