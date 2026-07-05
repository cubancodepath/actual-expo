import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prefsMMKV } from "../prefsStorage";
import { migrateLegacyPrefs } from "../migratePrefs";
import { useSessionStore } from "../sessionStore";
import { useBudgetContextStore } from "../budgetContextStore";
import { useServerCapabilitiesStore } from "../serverCapabilitiesStore";
import { useUiPrefsStore } from "../uiPrefsStore";

// The legacy monolithic prefsStore persisted a single JSON blob (zustand persist
// shape) under the "actual-prefs" key. migrateLegacyPrefs must fan those fields
// out into the four new stores exactly once, then delete the blob.

function legacyBlob(state: Record<string, unknown>): string {
  return JSON.stringify({ state, version: 0 });
}

describe("migrateLegacyPrefs", () => {
  beforeEach(() => {
    useSessionStore.getState().reset();
    useBudgetContextStore.getState().reset();
    useServerCapabilitiesStore.getState().reset();
    useUiPrefsStore.setState({
      themeMode: "system",
      language: "system",
      showProgressBars: true,
      hasSeenOnboarding: false,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("distributes legacy fields into the four new stores and clears the blob", () => {
    const store: Record<string, string> = {
      "actual-prefs": legacyBlob({
        serverUrl: "https://server",
        activeBudgetId: "budget-1",
        budgetName: "My Budget",
        fileId: "file-1",
        groupId: "group-1",
        encryptKeyId: "key-1",
        lastSyncedTimestamp: "2026-01-01T00:00:00Z",
        isLocalOnly: false,
        serverVersion: "26.4.0",
        themeMode: "dark",
        language: "es",
        showProgressBars: false,
        hasSeenOnboarding: true,
      }),
    };
    vi.spyOn(prefsMMKV, "getString").mockImplementation((k: string) => store[k]);
    const setSpy = vi.spyOn(prefsMMKV, "set").mockImplementation((k: string, v: string) => {
      store[k] = v;
    });
    const removeSpy = vi.spyOn(prefsMMKV, "remove").mockImplementation((k: string) => {
      delete store[k];
    });

    migrateLegacyPrefs();

    // Session
    expect(useSessionStore.getState().serverUrl).toBe("https://server");
    // Budget context
    const budget = useBudgetContextStore.getState();
    expect(budget.activeBudgetId).toBe("budget-1");
    expect(budget.budgetName).toBe("My Budget");
    expect(budget.fileId).toBe("file-1");
    expect(budget.groupId).toBe("group-1");
    expect(budget.encryptKeyId).toBe("key-1");
    expect(budget.lastSyncedTimestamp).toBe("2026-01-01T00:00:00Z");
    expect(budget.isLocalOnly).toBe(false);
    // Server capabilities — version + derived features
    const caps = useServerCapabilitiesStore.getState();
    expect(caps.serverVersion).toBe("26.4.0");
    expect(caps.serverFeatures.payeeLocations).toBe(true);
    // UI prefs
    const ui = useUiPrefsStore.getState();
    expect(ui.themeMode).toBe("dark");
    expect(ui.language).toBe("es");
    expect(ui.showProgressBars).toBe(false);
    expect(ui.hasSeenOnboarding).toBe(true);

    // Blob deleted, migration flag set
    expect(removeSpy).toHaveBeenCalledWith("actual-prefs");
    expect(setSpy).toHaveBeenCalledWith("prefs-migrated", "1");
  });

  it("is a no-op when already migrated", () => {
    const store: Record<string, string> = { "prefs-migrated": "1" };
    vi.spyOn(prefsMMKV, "getString").mockImplementation((k: string) => store[k]);
    const removeSpy = vi.spyOn(prefsMMKV, "remove");

    migrateLegacyPrefs();

    expect(useSessionStore.getState().serverUrl).toBe("");
    expect(removeSpy).not.toHaveBeenCalled();
  });

  it("marks migrated and skips seeding on a fresh install (no legacy blob)", () => {
    const store: Record<string, string> = {};
    vi.spyOn(prefsMMKV, "getString").mockImplementation((k: string) => store[k]);
    const setSpy = vi.spyOn(prefsMMKV, "set").mockImplementation((k: string, v: string) => {
      store[k] = v;
    });

    migrateLegacyPrefs();

    expect(useBudgetContextStore.getState().activeBudgetId).toBe("");
    expect(setSpy).toHaveBeenCalledWith("prefs-migrated", "1");
  });
});
