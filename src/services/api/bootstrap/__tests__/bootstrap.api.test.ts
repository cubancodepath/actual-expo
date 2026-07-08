import { describe, expect, it, vi } from "vitest";
import { getBootstrapInfo } from "../bootstrap.api";
import { expectActualError, fetchMock, jsonResponse, SERVER } from "../../__tests__/testUtils";

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

  it("defaults unknown login methods to password", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ loginMethod: "oauth" }));

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
