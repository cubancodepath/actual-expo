import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSyncStore } from "../syncStore";
import * as syncModule from "@/core/sync";

beforeEach(() => {
  useSyncStore.setState({
    status: "idle",
    lastErrorCode: null,
    conflictCode: null,
    lastSync: null,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useSyncStore.sync", () => {
  it("delegates to fullSync — status flows through sync events, not the caller", async () => {
    const spy = vi.spyOn(syncModule, "fullSync").mockResolvedValue(3);

    await useSyncStore.getState().sync();

    expect(spy).toHaveBeenCalledTimes(1);
    // sync() itself no longer stamps status — the event listener does.
    expect(useSyncStore.getState().status).toBe("idle");
  });

  it("bails without syncing while a conflict is pending", async () => {
    useSyncStore.setState({ conflictCode: "sync/file-has-reset" });
    const spy = vi.spyOn(syncModule, "fullSync").mockResolvedValue(0);

    await useSyncStore.getState().sync();

    expect(spy).not.toHaveBeenCalled();
  });

  it("force bypasses the conflict pause", async () => {
    useSyncStore.setState({ conflictCode: "sync/file-has-reset" });
    const spy = vi.spyOn(syncModule, "fullSync").mockResolvedValue(0);

    await useSyncStore.getState().sync({ force: true });

    expect(spy).toHaveBeenCalledWith({ force: true });
  });
});

describe("conflict pause & budget-switch reset", () => {
  afterEach(() => {
    useSyncStore.getState().resetForBudgetSwitch();
    syncModule.setSyncingMode("enabled");
  });

  it("_setConflict pauses the core mode; _resolveConflict unpauses and clears the badge", () => {
    useSyncStore.getState()._setConflict("sync/file-has-reset");

    expect(syncModule.checkSyncingMode("offline")).toBe(true);
    expect(useSyncStore.getState().conflictCode).toBe("sync/file-has-reset");

    useSyncStore.getState()._resolveConflict();

    expect(syncModule.checkSyncingMode("offline")).toBe(false);
    expect(useSyncStore.getState()).toMatchObject({
      conflictCode: null,
      lastErrorCode: null,
      status: "idle",
    });
  });

  it("non-conflict file errors (key-mismatch) do NOT pause the mode", async () => {
    await useSyncStore.getState().handleSyncFileError("sync/file-key-mismatch");

    expect(syncModule.checkSyncingMode("offline")).toBe(false);
    expect(useSyncStore.getState().lastErrorCode).toBe("sync/key-missing");
    expect(useSyncStore.getState().conflictCode).toBeNull();
  });

  it("resetForBudgetSwitch clears conflict, badge, lastSync AND the auto-recovery guard", async () => {
    // Arm the one-shot auto-recovery guard by making the recovery fail once.
    const failingReset = vi.fn().mockRejectedValue(new Error("boom"));
    useSyncStore.setState({ resetSync: failingReset });
    await useSyncStore.getState().handleSyncFileError("sync/file-needs-upload");
    expect(useSyncStore.getState().conflictCode).toBe("sync/file-needs-upload");

    useSyncStore.getState().resetForBudgetSwitch();

    expect(useSyncStore.getState()).toMatchObject({
      status: "idle",
      lastErrorCode: null,
      conflictCode: null,
      lastSync: null,
    });

    // Guard cleared → the same code auto-recovers again instead of jumping
    // straight to the conflict dialog (cross-budget contamination fix).
    failingReset.mockResolvedValue(undefined);
    await useSyncStore.getState().handleSyncFileError("sync/file-needs-upload");
    expect(failingReset).toHaveBeenCalledTimes(2);
  });
});

describe("useSyncStore setters", () => {
  it("_setStatus success stamps lastSync; syncing clears lastErrorCode", () => {
    useSyncStore.setState({ lastErrorCode: "network/timeout" });

    useSyncStore.getState()._setStatus("syncing");
    expect(useSyncStore.getState().lastErrorCode).toBeNull();

    useSyncStore.getState()._setStatus("success");
    expect(useSyncStore.getState().lastSync).toBeInstanceOf(Date);
  });

  it("_setErrorCode sets status to error with the given code", () => {
    useSyncStore.getState()._setErrorCode("sync/clock-drift");
    expect(useSyncStore.getState()).toMatchObject({
      status: "error",
      lastErrorCode: "sync/clock-drift",
    });
  });
});
