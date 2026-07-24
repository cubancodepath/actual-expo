// The composition root: installAppServices wires the app-lifetime listeners
// (sync policy + 401 policy) and its cleanup unregisters them.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const signOutMock = vi.hoisted(() => vi.fn());
vi.mock("@/stores/operations/users", () => ({ signOut: signOutMock }));

import { installAppServices } from "@/lib/app-services";
import { emit } from "@/core/sync/syncEvents";
import { emitErrorEvent } from "@/lib/errors/ErrorChannel";
import { useSyncStore } from "@/stores/syncStore";
import { ActualError } from "@/core/errors";

const settle = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  signOutMock.mockReset();
  signOutMock.mockResolvedValue(undefined);
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

describe("installAppServices", () => {
  it("registers the sync policy listener and the 401 policy", async () => {
    const cleanup = installAppServices();

    emit({ type: "start", tables: [] });
    await settle();
    expect(useSyncStore.getState().status).toBe("syncing");

    emitErrorEvent(new ActualError("auth/token-expired"));
    expect(signOutMock).toHaveBeenCalledTimes(1);

    cleanup();
  });

  it("cleanup unregisters both — no further reactions", async () => {
    const cleanup = installAppServices();
    cleanup();

    emit({ type: "success", tables: [] });
    await settle();
    expect(useSyncStore.getState().status).toBe("idle"); // listener gone

    emitErrorEvent(new ActualError("auth/token-expired"));
    expect(signOutMock).not.toHaveBeenCalled(); // policy gone
  });
});
