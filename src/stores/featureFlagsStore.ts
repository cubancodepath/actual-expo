import { create } from 'zustand';
import { registerStore } from './storeRegistry';
import { getAllFeatureFlags, setFeatureFlag } from '../preferences';
import {
  FEATURE_FLAG_DEFAULTS,
  type FeatureFlag,
} from '../preferences/featureFlags';

type FeatureFlagsState = Record<FeatureFlag, boolean> & {
  load(): Promise<void>;
  set(flag: FeatureFlag, enabled: boolean): Promise<void>;
};

export const useFeatureFlagsStore = create<FeatureFlagsState>((set) => ({
  ...FEATURE_FLAG_DEFAULTS,

  async load() {
    const flags = await getAllFeatureFlags();
    set(flags);
  },

  async set(flag, enabled) {
    set({ [flag]: enabled });
    await setFeatureFlag(flag, enabled);
  },
}));

registerStore('featureFlags', ['preferences'], () =>
  useFeatureFlagsStore.getState().load(),
);
