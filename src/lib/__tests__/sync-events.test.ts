// The app-layer sync policy listener (upstream listenForSyncEvent): every
// sync path reports through events, this maps them to store reactions.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { emit } from "@/core/sync/syncEvents";
import { listenForSyncEvent } from "@/lib/sync-events";
import { useSyncStore } from "@/stores/syncStore";
import { errorChannel, type ErrorEvent } from "@/lib/errors/ErrorChannel";
import { ActualError } from "@/core/errors";

/** emit() is sync but the handler hops the microtask queue (dynamic imports). */
const settle = () => new Promise((r) => setTimeout(r, 0));

let unlisten: () => void;

beforeEach(() => {
  useSyncStore.setState({
    status: "idle",
    lastErrorCode: null,
    conflictCode: null,
    lastSync: null,
  });
  unlisten = listenForSyncEvent();
});

afterEach(() => {
  unlisten();
  vi.restoreAllMocks();
});

describe("listenForSyncEvent", () => {
  it("start → syncing (clearing a stale error), success → success + lastSync", async () => {
    useSyncStore.setState({ lastErrorCode: "network/timeout" });

    emit({ type: "start", tables: [] });
    await settle();
    expect(useSyncStore.getState().status).toBe("syncing");
    expect(useSyncStore.getState().lastErrorCode).toBeNull();

    emit({ type: "success", tables: ["transactions"] });
    await settle();
    expect(useSyncStore.getState().status).toBe("success");
    expect(useSyncStore.getState().lastSync).toBeInstanceOf(Date);
  });

  it("error sync/file-* routes to handleSyncFileError", async () => {
    const spy = vi
      .spyOn(useSyncStore.getState(), "handleSyncFileError")
      .mockResolvedValue(undefined);
    useSyncStore.setState({ handleSyncFileError: spy });

    emit({
      type: "error",
      subtype: "sync/file-has-reset",
      meta: new ActualError("sync/file-has-reset"),
    });
    await settle();

    expect(spy).toHaveBeenCalledWith("sync/file-has-reset");
  });

  it("error network/offline stays silent — idle, no error code", async () => {
    const events: ErrorEvent[] = [];
    const unsub = errorChannel.subscribe((e) => events.push(e));

    emit({ type: "error", subtype: "network/offline", meta: new ActualError("network/offline") });
    await settle();
    unsub();

    expect(useSyncStore.getState().status).toBe("idle");
    expect(useSyncStore.getState().lastErrorCode).toBeNull();
    expect(events).toHaveLength(1); // logged, never surfaced as a badge
  });

  it("unknown errors set the error state and report to the bus", async () => {
    const events: ErrorEvent[] = [];
    const unsub = errorChannel.subscribe((e) => events.push(e));

    emit({ type: "error", subtype: "network/timeout", meta: new ActualError("network/timeout") });
    await settle();
    unsub();

    expect(useSyncStore.getState()).toMatchObject({
      status: "error",
      lastErrorCode: "network/timeout",
    });
    expect(events).toHaveLength(1);
  });
});
