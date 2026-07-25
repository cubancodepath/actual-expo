// The reset protocol (upstream sync/reset.ts): checkKey guard → server reset
// → wipe local CRDT state → clear sync metadata → re-upload, in that order.
import { describe, it, expect, beforeEach, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  order: [] as string[],
  checkKey: vi.fn(),
  resetSyncState: vi.fn(),
  exec: vi.fn(),
  loadClock: vi.fn(),
  readMetadata: vi.fn(),
  updateMetadata: vi.fn(),
  uploadBudget: vi.fn(),
  saveKey: vi.fn(),
}));

vi.mock("@/core/server/sync/cloudStorage", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  checkKey: mocks.checkKey,
  resetSyncState: mocks.resetSyncState,
}));
vi.mock("@/core/server/db", () => ({ getDb: () => ({ exec: mocks.exec }) }));
vi.mock("@/core/server/sync/clock", () => ({ loadClock: mocks.loadClock }));
vi.mock("@/core/server/prefs", () => ({
  readMetadata: mocks.readMetadata,
  updateMetadata: mocks.updateMetadata,
}));
vi.mock("@/core/server/cloud-storage", () => ({ uploadBudget: mocks.uploadBudget }));
vi.mock("@/core/platform/keyStore", () => ({ saveKey: mocks.saveKey }));

import { resetSync } from "@/core/server/sync/reset";

const CTX = {
  serverUrl: "https://s",
  token: "tok",
  cloudFileId: "cloud-1",
  budgetId: "budget-1",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.order.length = 0;
  mocks.checkKey.mockImplementation(async () => {
    mocks.order.push("checkKey");
    return { valid: true };
  });
  mocks.resetSyncState.mockImplementation(async () => {
    mocks.order.push("resetSyncState");
    return {};
  });
  mocks.exec.mockImplementation(async () => {
    mocks.order.push("clearLocalSyncState");
  });
  mocks.readMetadata.mockResolvedValue({ id: "budget-1", budgetName: "B", encryptKeyId: null });
  mocks.updateMetadata.mockImplementation(async () => {
    mocks.order.push("updateMetadata");
  });
  mocks.uploadBudget.mockImplementation(async () => {
    mocks.order.push("uploadBudget");
    return { groupId: "group-new" };
  });
});

describe("core resetSync protocol", () => {
  it("runs checkKey → server reset → local wipe → metadata clear → upload, in order", async () => {
    const result = await resetSync(CTX);

    expect(result).toEqual({ groupId: "group-new" });
    expect(mocks.order).toEqual([
      "checkKey",
      "resetSyncState",
      "clearLocalSyncState",
      "updateMetadata", // clears groupId/lastSyncedTimestamp/lastUploaded
      "uploadBudget",
      "updateMetadata", // records the new groupId
    ]);
    expect(mocks.updateMetadata).toHaveBeenNthCalledWith(1, "budget-1", {
      groupId: undefined,
      lastSyncedTimestamp: undefined,
      lastUploaded: undefined,
    });
    // cloudFileId is never touched — upload reuses it (upstream keeps it).
    for (const [, patch] of mocks.updateMetadata.mock.calls) {
      expect(patch).not.toHaveProperty("cloudFileId");
    }
  });

  it("refuses to upload when the key is stale (checkKey guard)", async () => {
    mocks.checkKey.mockResolvedValue({ valid: false, error: { reason: "key-mismatch" } });

    const result = await resetSync(CTX);

    expect(result).toEqual({ error: { reason: "file-has-new-key" } });
    expect(mocks.resetSyncState).not.toHaveBeenCalled();
    expect(mocks.uploadBudget).not.toHaveBeenCalled();
  });
});
