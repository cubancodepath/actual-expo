import { create } from "zustand";
import { persist } from "zustand/middleware";
import { mmkvStorage } from "./prefsStorage";

// ---------------------------------------------------------------------------
// UI preferences store — genuinely reactive user display settings.
// ---------------------------------------------------------------------------
// These are preserved across logout (they are not tied to a server/session).

type ThemeMode = "system" | "light" | "dark";
type Language = "system" | "en" | "es";

type UiPrefsState = {
  themeMode: ThemeMode;
  language: Language;
  showProgressBars: boolean;
  hasSeenOnboarding: boolean;

  setThemeMode(mode: ThemeMode): void;
  setLanguage(lang: Language): void;
  toggleProgressBars(): void;
  markOnboardingSeen(): void;
  /** Reset onboarding — used by the DEV-only replay button. */
  resetOnboarding(): void;
};

export const useUiPrefsStore = create<UiPrefsState>()(
  persist(
    (set) => ({
      themeMode: "system",
      language: "system",
      showProgressBars: true,
      hasSeenOnboarding: false,

      setThemeMode(mode) {
        set({ themeMode: mode });
      },

      setLanguage(lang) {
        // i18n language change is handled by the caller (settings screen) to
        // avoid circular imports between this store and i18n/config.
        set({ language: lang });
      },

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
        themeMode: state.themeMode,
        language: state.language,
        showProgressBars: state.showProgressBars,
        hasSeenOnboarding: state.hasSeenOnboarding,
      }),
    },
  ),
);
