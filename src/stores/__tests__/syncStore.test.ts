import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSyncStore } from "../syncStore";
import { ActualError } from "@/core/errors";
import { errorChannel, type ErrorEvent } from "@/lib/errors/ErrorChannel";
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
  it("sets status success and lastSync on a successful sync", async () => {
    vi.spyOn(syncModule, "fullSync").mockResolvedValue(3);

    await useSyncStore.getState().sync();

    const state = useSyncStore.getState();
    expect(state.status).toBe("success");
    expect(state.lastSync).toBeInstanceOf(Date);
    expect(state.lastErrorCode).toBeNull();
  });

  it("emits a failed sync to the error bus and records the code", async () => {
    const events: ErrorEvent[] = [];
    const unsubscribe = errorChannel.subscribe((event) => events.push(event));
    vi.spyOn(syncModule, "fullSync").mockRejectedValue(new ActualError("network/timeout"));

    await useSyncStore.getState().sync();
    unsubscribe();

    const state = useSyncStore.getState();
    expect(state.status).toBe("error");
    expect(state.lastErrorCode).toBe("network/timeout");
    expect(events).toHaveLength(1);
    expect(events[0].code).toBe("network/timeout");
  });

  it("treats network/offline as idle, not an error", async () => {
    const events: ErrorEvent[] = [];
    const unsubscribe = errorChannel.subscribe((event) => events.push(event));
    vi.spyOn(syncModule, "fullSync").mockRejectedValue(new ActualError("network/offline"));

    await useSyncStore.getState().sync();
    unsubscribe();

    const state = useSyncStore.getState();
    expect(state.status).toBe("idle");
    expect(state.lastErrorCode).toBeNull();
    expect(events).toHaveLength(1); // logged, but no error badge
  });

  it("bails without syncing while a conflict is pending", async () => {
    useSyncStore.setState({ conflictCode: "sync/file-has-reset" });
    const spy = vi.spyOn(syncModule, "fullSync").mockResolvedValue(0);

    await useSyncStore.getState().sync();

    expect(spy).not.toHaveBeenCalled();
  });

  it("clears lastErrorCode when a new sync starts", async () => {
    useSyncStore.setState({ status: "error", lastErrorCode: "db/unavailable" });
    vi.spyOn(syncModule, "fullSync").mockResolvedValue(0);

    const promise = useSyncStore.getState().sync();
    expect(useSyncStore.getState().lastErrorCode).toBeNull();
    await promise;
  });
});

describe("useSyncStore._setErrorCode", () => {
  it("sets status to error with the given code", () => {
    useSyncStore.getState()._setErrorCode("sync/clock-drift");
    expect(useSyncStore.getState()).toMatchObject({
      status: "error",
      lastErrorCode: "sync/clock-drift",
    });
  });
});
