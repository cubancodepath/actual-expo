// authPolicy: the single owner of the 401 → signOut reaction on the error bus.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const signOutMock = vi.hoisted(() => vi.fn());
vi.mock("@/stores/operations/users", () => ({ signOut: signOutMock }));

import { installAuthPolicy } from "@/lib/errors/authPolicy";
import { emitErrorEvent } from "@/lib/errors/ErrorChannel";
import { ActualError } from "@/core/errors";

let uninstall: () => void;

beforeEach(() => {
  signOutMock.mockReset();
  signOutMock.mockResolvedValue(undefined);
  uninstall = installAuthPolicy();
});

afterEach(() => {
  uninstall();
});

describe("installAuthPolicy", () => {
  it("signs out on an expired-token error", () => {
    emitErrorEvent(new ActualError("auth/token-expired"));
    expect(signOutMock).toHaveBeenCalledTimes(1);
  });

  it("ignores other error codes", () => {
    emitErrorEvent(new ActualError("network/timeout"));
    emitErrorEvent(new ActualError("sync/file-has-reset"));
    expect(signOutMock).not.toHaveBeenCalled();
  });

  it("collapses concurrent 401s into a single signOut (reentrancy guard)", () => {
    // Two distinct errors while the first signOut is still pending.
    let resolveSignOut!: () => void;
    signOutMock.mockReturnValue(new Promise<void>((r) => (resolveSignOut = r)));

    emitErrorEvent(new ActualError("auth/token-expired"));
    emitErrorEvent(new ActualError("auth/token-expired"));
    expect(signOutMock).toHaveBeenCalledTimes(1);

    resolveSignOut();
  });

  it("re-arms after a signOut settles (a later re-expiry triggers again)", async () => {
    emitErrorEvent(new ActualError("auth/token-expired"));
    expect(signOutMock).toHaveBeenCalledTimes(1);
    await Promise.resolve(); // let the finally reset the guard

    emitErrorEvent(new ActualError("auth/token-expired"));
    expect(signOutMock).toHaveBeenCalledTimes(2);
  });

  it("stops reacting after unsubscribe", () => {
    uninstall();
    emitErrorEvent(new ActualError("auth/token-expired"));
    expect(signOutMock).not.toHaveBeenCalled();
  });
});
