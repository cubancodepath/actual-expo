import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deleteFromServer } from "../budgetfiles";
import { ActualError, type ErrorCode } from "@/core/errors";
import { usePrefsStore } from "@/stores/prefsStore";

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function expectActualError(promise: Promise<unknown>, code: ErrorCode) {
  const error = await promise.then(
    () => {
      throw new Error("expected rejection");
    },
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(ActualError);
  expect((error as ActualError).code).toBe(code);
}

describe("deleteFromServer", () => {
  it("resolves on a 2xx response", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
    await expect(deleteFromServer("https://s", "tok", "file-1")).resolves.toBeUndefined();
  });

  it("maps a non-auth failure to file/delete-failed", async () => {
    fetchMock.mockResolvedValue(new Response("nope", { status: 500 }));
    await expectActualError(deleteFromServer("https://s", "tok", "file-1"), "file/delete-failed");
  });

  it("maps 401 to auth/token-expired and clears prefs", async () => {
    usePrefsStore.getState().setPrefs({ serverUrl: "https://s", token: "tok" });
    fetchMock.mockResolvedValue(new Response(null, { status: 401 }));

    await expectActualError(deleteFromServer("https://s", "tok", "file-1"), "auth/token-expired");
    // clearAll() is fire-and-forget (matches the original throwIfUnauthorized
    // behavior) — flush microtasks so its async work has a chance to settle.
    await new Promise((r) => setTimeout(r, 0));
    expect(usePrefsStore.getState().token).toBe("");
  });
});
