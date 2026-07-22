import { create } from "zustand";
import { persist } from "zustand/middleware";
import { mmkvStorage } from "./prefsStorage";

// ---------------------------------------------------------------------------
// UI preferences store — app-only device state with no upstream pref home.
// ---------------------------------------------------------------------------
// Preserved across logout (not tied to a server/session). NOTE: theme and
// language used to live here — they moved to GlobalPrefs (`useGlobalPref`) to
// align with upstream. What remains is first-run / progress UI state that has
// no upstream equivalent.

type UiPrefsState = {
  showProgressBars: boolean;
  hasSeenOnboarding: boolean;

  toggleProgressBars(): void;
  markOnboardingSeen(): void;
  /** Reset onboarding — used by the DEV-only replay button. */
  resetOnboarding(): void;
};

export const useUiPrefsStore = create<UiPrefsState>()(
  persist(
    (set) => ({
      showProgressBars: true,
      hasSeenOnboarding: false,

      toggleProgressBars() {
        set((state) => ({ showProgressBars: !state.showProgressBars }));
      },

      markOnboardingSeen() {
        set({ hasSeenOnboarding: true });
      },

      resetOnboarding() {
        set({ hasSeenOnboarding: false });
      },
    }),
    {
      name: "ui-prefs",
      storage: mmkvStorage,
      partialize: (state) => ({
        showProgressBars: state.showProgressBars,
        hasSeenOnboarding: state.hasSeenOnboarding,
      }),
    },
  ),
);
