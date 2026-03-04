import { create } from 'zustand';
import { getAllPreferences, setPreference } from '../preferences';
import { PREFERENCE_DEFAULTS, type PreferenceKey } from '../preferences/types';

type PreferencesState = {
  dateFormat: string;
  numberFormat: string;
  firstDayOfWeekIdx: string;
  hideFraction: string;
  load(): Promise<void>;
  set(key: PreferenceKey, value: string): Promise<void>;
};

export const usePreferencesStore = create<PreferencesState>((set) => ({
  ...PREFERENCE_DEFAULTS,

  async load() {
    const prefs = await getAllPreferences();
    set(prefs);
  },

  async set(key, value) {
    set({ [key]: value });
    await setPreference(key, value);
  },
}));
