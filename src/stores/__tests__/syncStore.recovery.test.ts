import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  postMock,
  clearLocalSyncStateMock,
  setSyncingModeMock,
  fullSyncMock,
  readMetadataMock,
  updateMetadataMock,
  deleteBudgetDirMock,
  uploadBudgetMock,
  listRemoteBudgetFilesMock,
  setBudgetContextMock,
} = vi.hoisted(() => ({
  postMock: vi.fn(),
  clearLocalSyncStateMock: vi.fn(),
  setSyncingModeMock: vi.fn(),
  fullSyncMock: vi.fn(),
  readMetadataMock: vi.fn(),
  updateMetadataMock: vi.fn(),
  deleteBudgetDirMock: vi.fn(),
  uploadBudgetMock: vi.fn(),
  listRemoteBudgetFilesMock: vi.fn(),
  setBudgetContextMock: vi.fn(),
}));

vi.mock("@/core/post", () => ({ post: postMock, mapServerReason: vi.fn() }));
vi.mock("@/core/sync", () => ({
  clearLocalSyncState: clearLocalSyncStateMock,
  setSyncingMode: setSyncingModeMock,
  fullSync: fullSyncMock,
}));
// syncStore.resetSync delegates the reset protocol to core/sync/reset (the
// order of steps is covered by that module's own test — resetProtocol.test.ts);
// here we only care about the store-level orchestration around it.
const coreResetSyncMock = vi.hoisted(() => vi.fn());
vi.mock("@/core/sync/reset", () => ({ resetSync: coreResetSyncMock }));
vi.mock("@/lib/errors/ErrorChannel", () => ({ emitErrorEvent: vi.fn() }));
vi.mock("@/stores/sessionStore", () => ({
  useSessionStore: { getState: () => ({ serverUrl: "https://s", token: "tok" }) },
}));
vi.mock("@/stores/budgetContextStore", () => ({
  useBudgetContextStore: {
    getState: () => ({
      activeBudgetId: "budget-1",
      setBudgetContext: setBudgetContextMock,
      closeBudget: vi.fn().mockResolvedValue(undefined),
      loadBudget: vi.fn().mockResolvedValue(undefined),
    }),
  },
}));
vi.mock("@/core/server/prefs", () => ({
  readMetadata: readMetadataMock,
  updateMetadata: updateMetadataMock,
  deleteBudgetDir: deleteBudgetDirMock,
  loadPrefs: vi.fn(async () => ({ id: "budget-1", budgetName: "b" })),
  unloadPrefs: vi.fn(),
  getPrefs: vi.fn(() => null),
}));
vi.mock("@/core/server/cloud-storage", () => ({
  getRemoteFiles: listRemoteBudgetFilesMock,
  uploadBudget: uploadBudgetMock,
  downloadBudget: vi.fn().mockResolvedValue("budget-2"),
}));

import { useSyncStore } from "@/stores/syncStore";

beforeEach(() => {
  vi.clearAllMocks();
  fullSyncMock.mockResolvedValue(0);
  useSyncStore.setState({ status: "idle", lastErrorCode: null, conflictCode: null });
  readMetadataMock.mockResolvedValue({
    id: "budget-1",
    budgetName: "Budget",
    cloudFileId: "cloud-1",
    groupId: "group-old",
  });
  uploadBudgetMock.mockResolvedValue({ cloudFileId: "cloud-1", groupId: "group-new" });
});

describe("resetSyncBudget", () => {
  beforeEach(() => {
    coreResetSyncMock.mockResolvedValue({ groupId: "group-new" });
  });

  it("delegates the reset protocol to core resetSync with the session context", async () => {
    await useSyncStore.getState().resetSync();

    expect(coreResetSyncMock).toHaveBeenCalledWith({
      serverUrl: "https://s",
      token: "tok",
      cloudFileId: "cloud-1",
      budgetId: "budget-1",
    });
  });

  it("maps a checkKey rejection to sync/file-has-new-key and does not resolve the conflict", async () => {
    useSyncStore.setState({ conflictCode: "sync/file-has-reset" });
    coreResetSyncMock.mockResolvedValue({ error: { reason: "file-has-new-key" } });

    await expect(useSyncStore.getState().resetSync()).rejects.toMatchObject({
      code: "sync/file-has-new-key",
    });
    expect(useSyncStore.getState().conflictCode).toBe("sync/file-has-reset");
    expect(fullSyncMock).not.toHaveBeenCalled();
  });

  it("re-enables sync, clears the conflict, and syncs with the new groupId on success", async () => {
    useSyncStore.setState({ conflictCode: "sync/file-has-reset" });

    await useSyncStore.getState().resetSync();

    expect(useSyncStore.getState().conflictCode).toBeNull();
    expect(setSyncingModeMock).toHaveBeenCalledWith("enabled");
    expect(setBudgetContextMock).toHaveBeenCalledWith({
      groupId: "group-new",
      lastSyncedTimestamp: undefined,
    });
    expect(fullSyncMock).toHaveBeenCalledWith({ force: true });
  });
});

describe("handleSyncFileError", () => {
  it("pauses sync and raises the conflict for dialog-driven codes", async () => {
    await useSyncStore.getState().handleSyncFileError("sync/file-has-reset");

    expect(setSyncingModeMock).toHaveBeenCalledWith("offline");
    expect(useSyncStore.getState().conflictCode).toBe("sync/file-has-reset");
    // No automatic recovery for user-decision codes
    expect(postMock).not.toHaveBeenCalled();
    expect(uploadBudgetMock).not.toHaveBeenCalled();
  });

  it("auto-recovers file-not-found by re-uploading once, then falls back to the dialog", async () => {
    await useSyncStore.getState().handleSyncFileError("sync/file-not-found");
    expect(uploadBudgetMock).toHaveBeenCalledTimes(1);
    expect(useSyncStore.getState().conflictCode).toBeNull();

    // Guard was cleared by the successful recovery — a NEW rejection retries…
    uploadBudgetMock.mockRejectedValueOnce(new Error("still rejected"));
    await useSyncStore.getState().handleSyncFileError("sync/file-not-found");
    expect(useSyncStore.getState().conflictCode).toBe("sync/file-not-found");

    // …but a second consecutive failure goes straight to the dialog.
    await useSyncStore.getState().handleSyncFileError("sync/file-not-found");
    expect(uploadBudgetMock).toHaveBeenCalledTimes(2);
  });

  it("routes file-key-mismatch into the existing key-missing reopen flow", async () => {
    await useSyncStore.getState().handleSyncFileError("sync/file-key-mismatch");

    expect(useSyncStore.getState().lastErrorCode).toBe("sync/key-missing");
    expect(useSyncStore.getState().conflictCode).toBeNull();
  });
});
