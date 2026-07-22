import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { removeFile } from "../budgetfiles";
import { ActualError, type ErrorCode } from "@/core/errors";
import { useSessionStore } from "@/stores/sessionStore";

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
    await expect(removeFile("https://s", "tok", "file-1")).resolves.toBeUndefined();
  });

  it("maps a non-auth failure to file/delete-failed", async () => {
    fetchMock.mockResolvedValue(new Response("nope", { status: 500 }));
    await expectActualError(removeFile("https://s", "tok", "file-1"), "file/delete-failed");
  });

  it("maps 401 to auth/token-expired without touching the session", async () => {
    useSessionStore.setState({ serverUrl: "https://s", token: "tok", hasToken: true });
    fetchMock.mockResolvedValue(new Response(null, { status: 401 }));

    await expectActualError(removeFile("https://s", "tok", "file-1"), "auth/token-expired");
    // The core transport only THROWS (upstream parity); the logout is the app
    // layer's job (react-query's global onError), so the session is untouched here.
    await new Promise((r) => setTimeout(r, 0));
    expect(useSessionStore.getState().token).toBe("tok");
  });
});
