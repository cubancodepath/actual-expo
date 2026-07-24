// In-memory prefs (upstream loadPrefs/getPrefs/savePrefs/unloadPrefs): the
// budget-scoped snapshot core/sync reads instead of importing app stores.
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import {
  loadPrefs,
  getPrefs,
  savePrefs,
  unloadPrefs,
  readMetadata,
  writeMetadata,
  deleteBudgetDir,
} from "@/core/server/prefs";

let seq = 0;
let BUDGET_ID = "";

describe("in-memory prefs", () => {
  beforeEach(() => {
    // Unique id per test — the node fs seam persists across tests in a file.
    BUDGET_ID = `prefs-test-budget-${++seq}`;
  });
  afterEach(async () => {
    unloadPrefs();
    await deleteBudgetDir(BUDGET_ID).catch(() => {});
  });

  it("loads from metadata.json and forces the current id", async () => {
    await writeMetadata(BUDGET_ID, {
      id: "stale-id-from-a-moved-folder",
      budgetName: "My budget",
      cloudFileId: "cf-1",
      groupId: "g-1",
    });

    const prefs = await loadPrefs(BUDGET_ID);

    expect(prefs.id).toBe(BUDGET_ID);
    expect(prefs.budgetName).toBe("My budget");
    expect(getPrefs()?.cloudFileId).toBe("cf-1");
  });

  it("is lenient when metadata is missing — defaults the name to the id", async () => {
    const prefs = await loadPrefs(BUDGET_ID);

    expect(prefs).toEqual({ id: BUDGET_ID, budgetName: BUDGET_ID });
  });

  it("savePrefs updates memory and persists to metadata.json", async () => {
    await writeMetadata(BUDGET_ID, { id: BUDGET_ID, budgetName: "My budget" });
    await loadPrefs(BUDGET_ID);

    await savePrefs({ lastSyncedTimestamp: "2026-07-24T00:00:00.000Z-0000-abc" });

    expect(getPrefs()?.lastSyncedTimestamp).toBe("2026-07-24T00:00:00.000Z-0000-abc");
    const onDisk = await readMetadata(BUDGET_ID);
    expect(onDisk?.lastSyncedTimestamp).toBe("2026-07-24T00:00:00.000Z-0000-abc");
    expect(onDisk?.budgetName).toBe("My budget");
  });

  it("savePrefs is a no-op before loadPrefs / after unloadPrefs", async () => {
    unloadPrefs();
    await savePrefs({ budgetName: "ghost" }, { avoidSync: true });
    expect(getPrefs()).toBeNull();
  });

  it("unloadPrefs clears the snapshot", async () => {
    await loadPrefs(BUDGET_ID);
    unloadPrefs();
    expect(getPrefs()).toBeNull();
  });
});
