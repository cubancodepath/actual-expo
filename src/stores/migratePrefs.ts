import { prefsMMKV } from "./prefsStorage";
import { useSessionStore } from "./sessionStore";
import { useBudgetContextStore } from "./budgetContextStore";
import { useServerCapabilitiesStore } from "./serverCapabilitiesStore";
import { useUiPrefsStore } from "./uiPrefsStore";

// ---------------------------------------------------------------------------
// One-time migration from the legacy monolithic `prefsStore`.
// ---------------------------------------------------------------------------
// The old store persisted a single JSON blob under the MMKV key "actual-prefs"
// (zustand persist shape: { state: {...}, version }). The four new stores use
// their own keys ("session" / "budget-context" / "server-capabilities" /
// "ui-prefs"), so without this migration an app upgrade would read empty state
// and effectively log the user out and drop their active budget + theme.
//
// This runs synchronously at bootstrap BEFORE loadToken(), seeds each new store
// from the legacy blob, deletes the blob, and marks itself done. The auth token
// is untouched — it already lives in expo-secure-store.

const LEGACY_KEY = "actual-prefs";
const MIGRATED_FLAG = "prefs-migrated";

type LegacyState = {
  serverUrl?: string;
  activeBudgetId?: string;
  budgetName?: string;
  fileId?: string;
  groupId?: string;
  encryptKeyId?: string;
  lastSyncedTimestamp?: string;
  isLocalOnly?: boolean;
  serverVersion?: string;
  themeMode?: "system" | "light" | "dark";
  language?: "system" | "en" | "es";
  showProgressBars?: boolean;
  hasSeenOnboarding?: boolean;
};

export function migrateLegacyPrefs(): void {
  if (prefsMMKV.getString(MIGRATED_FLAG)) return;

  const raw = prefsMMKV.getString(LEGACY_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as { state?: LegacyState } | null;
      const s = parsed?.state ?? {};

      if (s.serverUrl) useSessionStore.getState().setServerUrl(s.serverUrl);

      useBudgetContextStore.getState().setBudgetContext({
        activeBudgetId: s.activeBudgetId ?? "",
        budgetName: s.budgetName,
        fileId: s.fileId ?? "",
        groupId: s.groupId ?? "",
        encryptKeyId: s.encryptKeyId,
        lastSyncedTimestamp: s.lastSyncedTimestamp,
        isLocalOnly: s.isLocalOnly ?? false,
      });

      if (s.serverVersion) {
        useServerCapabilitiesStore.getState().setServerVersion(s.serverVersion);
      }

      useUiPrefsStore.setState({
        themeMode: s.themeMode ?? "system",
        language: s.language ?? "system",
        showProgressBars: s.showProgressBars ?? true,
        hasSeenOnboarding: s.hasSeenOnboarding ?? false,
      });
    } catch {
      // Corrupt/unreadable legacy blob — start fresh rather than crash bootstrap.
    }
    prefsMMKV.remove(LEGACY_KEY);
  }

  prefsMMKV.set(MIGRATED_FLAG, "1");
}
