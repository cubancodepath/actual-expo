import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSyncStore } from "../syncStore";
import { ActualError, setErrorSink } from "@/core/errors";
import * as syncModule from "@/core/sync";

beforeEach(() => {
  useSyncStore.setState({ status: "idle", lastErrorCode: null, lastSync: null });
  setErrorSink(() => {});
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

  it("routes a failed sync through reportError and records the code", async () => {
    const sink = vi.fn();
    setErrorSink(sink);
    vi.spyOn(syncModule, "fullSync").mockRejectedValue(new ActualError("network/timeout"));

    await useSyncStore.getState().sync();

    const state = useSyncStore.getState();
    expect(state.status).toBe("error");
    expect(state.lastErrorCode).toBe("network/timeout");
    expect(sink).toHaveBeenCalledTimes(1);
    expect(sink.mock.calls[0][0].error.code).toBe("network/timeout");
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
