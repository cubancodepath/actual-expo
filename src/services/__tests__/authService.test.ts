import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getBootstrapInfo, listFiles, login } from "../authService";
import { getServerInfo } from "../serverInfo";
import { ActualError, type ErrorCode } from "@/core/errors";

const SERVER = "https://budget.example.com";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
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

describe("getBootstrapInfo", () => {
  it("parses the modern availableLoginMethods shape", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        data: {
          bootstrapped: true,
          availableLoginMethods: [
            { method: "password", active: false },
            { method: "openid", active: true },
          ],
        },
      }),
    );

    await expect(getBootstrapInfo(SERVER)).resolves.toEqual({
      bootstrapped: true,
      loginMethod: "openid",
    });
  });

  it("falls back to the legacy loginMethod scalar and un-enveloped body", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ bootstrapped: false, loginMethod: "password" }));

    await expect(getBootstrapInfo(SERVER)).resolves.toEqual({
      bootstrapped: false,
      loginMethod: "password",
    });
  });

  it("defaults to bootstrapped=true and password when fields are missing", async () => {
    fetchMock.mockResolvedValue(jsonResponse({}));

    await expect(getBootstrapInfo(SERVER)).resolves.toEqual({
      bootstrapped: true,
      loginMethod: "password",
    });
  });

  it("retries with backoff and reports network/offline when the server is unreachable", async () => {
    vi.useFakeTimers();
    fetchMock.mockRejectedValue(new TypeError("Network request failed"));

    const promise = getBootstrapInfo(SERVER);
    const assertion = expectActualError(promise, "network/offline");
    await vi.runAllTimersAsync();
    await assertion;

    // 1 initial attempt + 3 retries
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("maps a non-2xx response to network/offline", async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValue(jsonResponse({ error: "nope" }, 500));

    const promise = getBootstrapInfo(SERVER);
    const assertion = expectActualError(promise, "network/offline");
    await vi.runAllTimersAsync();
    await assertion;
  });
});

describe("login", () => {
  it("returns the token from an enveloped response", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: { token: "tok-123" } }));

    await expect(login(SERVER, "hunter2")).resolves.toBe("tok-123");
  });

  it("returns the token from a flat response", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ token: "tok-456" }));

    await expect(login(SERVER, "hunter2")).resolves.toBe("tok-456");
  });

  it("maps the server's invalid-password reason", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ status: "error", reason: "invalid-password" }, 400));

    await expectActualError(login(SERVER, "wrong"), "auth/invalid-password");
  });

  it("maps 401 without a reason to auth/unauthorized", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ status: "error" }, 401));

    await expectActualError(login(SERVER, "pw"), "auth/unauthorized");
  });

  it("maps a 2xx response without a token to http/server-error", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: {} }));

    await expectActualError(login(SERVER, "pw"), "http/server-error");
  });
});

describe("listFiles", () => {
  const rawFile = {
    fileId: "f1",
    groupId: "g1",
    name: "My Budget",
    encryptKeyId: null,
    deleted: 0,
    usersWithAccess: [{ owner: true, displayName: "Ana" }],
  };

  it("parses files and sends the token header", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: [rawFile] }));

    const files = await listFiles(SERVER, "tok");

    expect(files).toEqual([
      {
        fileId: "f1",
        groupId: "g1",
        name: "My Budget",
        encryptKeyId: undefined,
        deleted: false,
        ownerName: "Ana",
      },
    ]);
    const request = fetchMock.mock.calls[0][0] as Request;
    expect(request.headers.get("x-actual-token")).toBe("tok");
  });

  it("throws auth/token-expired on 401 without touching any store", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ status: "error" }, 401));

    await expectActualError(listFiles(SERVER, "stale"), "auth/token-expired");
  });
});

describe("getServerInfo", () => {
  it("reads the build version", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ build: { version: "26.2.1" } }));

    await expect(getServerInfo(SERVER)).resolves.toEqual({ version: "26.2.1" });
  });

  it("falls back to 0.0.0 on any failure", async () => {
    fetchMock.mockRejectedValue(new TypeError("Network request failed"));

    await expect(getServerInfo(SERVER)).resolves.toEqual({ version: "0.0.0" });
  });
});
