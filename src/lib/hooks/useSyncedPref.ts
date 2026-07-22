/**
 * useSyncedPref — read/write a single cross-device (synced) preference.
 *
 * Faithful upstream-aligned entry point in the hooks layer. The implementation
 * (and the shared synced-prefs cache) currently lives in `@/hooks/useSyncedPrefs`
 * during the strangler migration; re-exported here so new code imports from the
 * `@/lib/hooks/*` location like the other `use*Pref` hooks.
 */
export { useSyncedPref, useSyncedPrefs, useSyncedPrefsStore } from "@/hooks/useSyncedPrefs";
