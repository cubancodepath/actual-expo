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
vi.mock("@/lib/errors/ErrorChannel", () => ({ emitErrorEvent: vi.fn() }));
vi.mock("@/stores/sessionStore", () => ({
  useSessionStore: { getState: () => ({ serverUrl: "https://s", token: "tok" }) },
}));
vi.mock("@/stores/budgetContextStore", () => ({
  useBudgetContextStore: {
    getState: () => ({ activeBudgetId: "budget-1", setBudgetContext: setBudgetContextMock }),
  },
}));
vi.mock("@/services/budgetMetadata", () => ({
  readMetadata: readMetadataMock,
  updateMetadata: updateMetadataMock,
  deleteBudgetDir: deleteBudgetDirMock,
}));
vi.mock("@/services/api/budgetFiles.api", () => ({
  listRemoteBudgetFiles: listRemoteBudgetFilesMock,
}));
vi.mock("@/services/budgetfiles", () => ({
  uploadBudget: uploadBudgetMock,
  downloadBudget: vi.fn().mockResolvedValue("budget-2"),
  openBudget: vi.fn().mockResolvedValue(undefined),
  closeBudget: vi.fn().mockResolvedValue(undefined),
}));

import { resetSyncBudget, handleSyncFileError } from "@/services/syncRecovery";
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
  it("resets the server file BEFORE re-uploading, and clears local sync state in between", async () => {
    const order: string[] = [];
    postMock.mockImplementation(async (url: string) => order.push(url));
    clearLocalSyncStateMock.mockImplementation(async () => order.push("clearLocalSyncState"));
    uploadBudgetMock.mockImplementation(async () => {
      order.push("uploadBudget");
      return { cloudFileId: "cloud-1", groupId: "group-new" };
    });

    await resetSyncBudget();

    expect(order).toEqual([
      "https://s/sync/reset-user-file",
      "clearLocalSyncState",
      "uploadBudget",
    ]);
    expect(postMock).toHaveBeenCalledWith("https://s/sync/reset-user-file", {
      token: "tok",
      fileId: "cloud-1",
    });
  });

  it("clears groupId/lastSyncedTimestamp/lastUploaded but keeps cloudFileId", async () => {
    await resetSyncBudget();

    expect(updateMetadataMock).toHaveBeenCalledWith("budget-1", {
      groupId: undefined,
      lastSyncedTimestamp: undefined,
      lastUploaded: undefined,
    });
    // cloudFileId untouched → uploadBudget reuses it (upstream keeps the fileId on reset)
    const metaUpdates = updateMetadataMock.mock.calls.map((c) => c[1]);
    for (const update of metaUpdates) {
      expect(update).not.toHaveProperty("cloudFileId");
    }
  });

  it("re-enables sync and clears the conflict on success", async () => {
    useSyncStore.setState({ conflictCode: "sync/file-has-reset" });

    await resetSyncBudget();

    expect(useSyncStore.getState().conflictCode).toBeNull();
    expect(setSyncingModeMock).toHaveBeenCalledWith("enabled");
    expect(setBudgetContextMock).toHaveBeenCalledWith({ groupId: "group-new" });
  });
});

describe("handleSyncFileError", () => {
  it("pauses sync and raises the conflict for dialog-driven codes", async () => {
    await handleSyncFileError("sync/file-has-reset");

    expect(setSyncingModeMock).toHaveBeenCalledWith("offline");
    expect(useSyncStore.getState().conflictCode).toBe("sync/file-has-reset");
    // No automatic recovery for user-decision codes
    expect(postMock).not.toHaveBeenCalled();
    expect(uploadBudgetMock).not.toHaveBeenCalled();
  });

  it("auto-recovers file-not-found by re-uploading once, then falls back to the dialog", async () => {
    await handleSyncFileError("sync/file-not-found");
    expect(uploadBudgetMock).toHaveBeenCalledTimes(1);
    expect(useSyncStore.getState().conflictCode).toBeNull();

    // Guard was cleared by the successful recovery — a NEW rejection retries…
    uploadBudgetMock.mockRejectedValueOnce(new Error("still rejected"));
    await handleSyncFileError("sync/file-not-found");
    expect(useSyncStore.getState().conflictCode).toBe("sync/file-not-found");

    // …but a second consecutive failure goes straight to the dialog.
    await handleSyncFileError("sync/file-not-found");
    expect(uploadBudgetMock).toHaveBeenCalledTimes(2);
  });

  it("routes file-key-mismatch into the existing key-missing reopen flow", async () => {
    await handleSyncFileError("sync/file-key-mismatch");

    expect(useSyncStore.getState().lastErrorCode).toBe("sync/key-missing");
    expect(useSyncStore.getState().conflictCode).toBeNull();
  });
});
