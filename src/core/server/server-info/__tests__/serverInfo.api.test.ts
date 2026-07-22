import { describe, expect, it } from "vitest";
import { getServerInfo } from "../serverInfo.api";
import { fetchMock, jsonResponse, SERVER } from "../../util/__tests__/testUtils";

describe("getServerInfo", () => {
  it("reads the build version", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ build: { version: "26.2.1" } }));

    await expect(getServerInfo(SERVER)).resolves.toEqual({ version: "26.2.1" });
  });

  it("reads the root version", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ version: "26.3.0" }));

    await expect(getServerInfo(SERVER)).resolves.toEqual({ version: "26.3.0" });
  });

  it("falls back to 0.0.0 on invalid payload", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ build: { version: 26 } }));

    await expect(getServerInfo(SERVER)).resolves.toEqual({ version: "0.0.0" });
  });

  it("falls back to 0.0.0 on any failure", async () => {
    fetchMock.mockRejectedValue(new TypeError("Network request failed"));

    await expect(getServerInfo(SERVER)).resolves.toEqual({ version: "0.0.0" });
  });
});
