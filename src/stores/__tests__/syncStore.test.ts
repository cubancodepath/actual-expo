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
