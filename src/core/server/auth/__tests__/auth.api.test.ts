import { describe, expect, it } from "vitest";
import { loginWithPassword } from "../auth.api";
import { expectActualError, fetchMock, jsonResponse, SERVER } from "../../util/__tests__/testUtils";

describe("loginWithPassword", () => {
  it("returns the token from an enveloped response", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: { token: "tok-123" } }));

    await expect(loginWithPassword(SERVER, "hunter2")).resolves.toBe("tok-123");
  });

  it("returns the token from a flat response", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ token: "tok-456" }));

    await expect(loginWithPassword(SERVER, "hunter2")).resolves.toBe("tok-456");
  });

  it("maps the server's invalid-password reason", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ status: "error", reason: "invalid-password" }, 400));

    await expectActualError(loginWithPassword(SERVER, "wrong"), "auth/invalid-password");
  });

  it("maps 401 without a reason to auth/unauthorized", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ status: "error" }, 401));

    await expectActualError(loginWithPassword(SERVER, "pw"), "auth/unauthorized");
  });

  it("maps a 2xx response without a token to http/server-error", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: {} }));

    await expectActualError(loginWithPassword(SERVER, "pw"), "http/server-error");
  });
});
