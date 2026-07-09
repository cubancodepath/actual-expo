import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { post, postBinary } from "../post";
import { ActualError, type ErrorCode } from "@/core/errors";

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

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

describe("post", () => {
  it("returns responseData.data on a 200 with status: ok", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ status: "ok", data: { hello: "world" } }));

    await expect(post("https://s/endpoint", { a: 1 })).resolves.toEqual({ hello: "world" });
  });

  it("maps a 500 to http/server-error", async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, 500));
    await expectActualError(post("https://s/endpoint", {}), "http/server-error");
  });

  it("maps a JSON error body's unauthorized reason to auth/token-expired", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ status: "error", reason: "unauthorized" }, 401));
    await expectActualError(post("https://s/endpoint", {}), "auth/token-expired");
  });

  it("maps a JSON error body's arbitrary reason to http/rejected with serverReason", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ status: "error", reason: "weird-reason" }, 404));
    const error = await post("https://s/endpoint", {}).then(
      () => {
        throw new Error("expected rejection");
      },
      (e: unknown) => e as ActualError,
    );
    expect(error.code).toBe("http/rejected");
    expect(error.context?.serverReason).toBe("weird-reason");
  });

  it("maps a JSON file-state reason to its sync/file-* code", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ status: "error", reason: "file-not-found" }, 404));
    await expectActualError(post("https://s/endpoint", {}), "sync/file-not-found");
  });

  it("maps an ngrok tunnel error header to network/offline", async () => {
    fetchMock.mockResolvedValue(
      new Response("tunnel down", { status: 502, headers: { "ngrok-error-code": "ERR_NGROK_1" } }),
    );
    await expectActualError(post("https://s/endpoint", {}), "network/offline");
  });

  it("maps a 200 response with status !== 'ok' via the reason/description", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ status: "error", reason: "token-expired" }));
    await expectActualError(post("https://s/endpoint", {}), "auth/token-expired");
  });

  it("maps a malformed JSON 200 body to http/parse-error", async () => {
    fetchMock.mockResolvedValue(new Response("not json", { status: 200 }));
    await expectActualError(post("https://s/endpoint", {}), "http/parse-error");
  });

  it("maps a network failure to network/offline", async () => {
    fetchMock.mockRejectedValue(new TypeError("Network request failed"));
    await expectActualError(post("https://s/endpoint", {}), "network/offline");
  });
});

describe("postBinary", () => {
  it("returns the response bytes on success", async () => {
    const payload = new Uint8Array([1, 2, 3, 4]);
    fetchMock.mockResolvedValue(new Response(payload.slice().buffer, { status: 200 }));

    const result = await postBinary("https://s/sync", new Uint8Array([9, 9]));
    expect(result).toEqual(payload);
  });

  it("maps a 500 to http/server-error without double-reading the body", async () => {
    fetchMock.mockResolvedValue(new Response(new TextEncoder().encode("boom"), { status: 500 }));
    await expectActualError(postBinary("https://s/sync", new Uint8Array([1])), "http/server-error");
  });

  it("maps a JSON error body on a non-2xx binary response to its domain code", async () => {
    const body = new TextEncoder().encode(
      JSON.stringify({ status: "error", reason: "unauthorized" }),
    );
    fetchMock.mockResolvedValue(
      new Response(body, { status: 401, headers: { "Content-Type": "application/json" } }),
    );
    await expectActualError(
      postBinary("https://s/sync", new Uint8Array([1])),
      "auth/token-expired",
    );
  });

  it("maps a network failure to network/offline", async () => {
    fetchMock.mockRejectedValue(new TypeError("Network request failed"));
    await expectActualError(postBinary("https://s/sync", new Uint8Array([1])), "network/offline");
  });

  // The sync server rejects /sync/sync with res.send('file-has-reset') —
  // a 400 whose body is the RAW reason string (Content-Type text/html, not
  // JSON). These used to flatten to a generic, unrecoverable http/rejected.
  it.each([
    ["file-has-reset", "sync/file-has-reset"],
    ["file-has-new-key", "sync/file-has-new-key"],
    ["file-old-version", "sync/file-old-version"],
    ["file-needs-upload", "sync/file-needs-upload"],
    ["file-not-found", "sync/file-not-found"],
    ["file-key-mismatch", "sync/file-key-mismatch"],
  ] as const)("maps a plain-text 400 body %s to %s", async (body, code) => {
    fetchMock.mockResolvedValue(
      new Response(new TextEncoder().encode(body), {
        status: 400,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      }),
    );
    await expectActualError(postBinary("https://s/sync", new Uint8Array([1])), code);
  });

  it("still maps an unknown plain-text 400 body to http/rejected", async () => {
    fetchMock.mockResolvedValue(
      new Response(new TextEncoder().encode("nope"), {
        status: 400,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      }),
    );
    await expectActualError(postBinary("https://s/sync", new Uint8Array([1])), "http/rejected");
  });
});
