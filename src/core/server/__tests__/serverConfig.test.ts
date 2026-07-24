import { describe, it, expect, afterEach } from "vitest";
import {
  getServer,
  setServer,
  setUserToken,
  getUserToken,
  isValidBaseURL,
} from "@/core/server/server-config";

describe("server-config", () => {
  afterEach(() => {
    setServer(null);
    setUserToken(null);
  });

  it("derives endpoint URLs from the base (upstream shape)", () => {
    setServer("https://sync.example.com");

    const config = getServer();
    expect(config?.BASE_SERVER).toBe("https://sync.example.com");
    expect(config?.SYNC_SERVER).toBe("https://sync.example.com/sync");
    expect(config?.SIGNUP_SERVER).toBe("https://sync.example.com/account");
  });

  it("handles a base URL with a path prefix", () => {
    setServer("https://example.com/actual");

    expect(getServer()?.SYNC_SERVER).toBe("https://example.com/actual/sync");
  });

  it("clears on null/empty", () => {
    setServer("https://sync.example.com");
    setServer(null);
    expect(getServer()).toBeNull();

    setServer("https://sync.example.com");
    setServer("");
    expect(getServer()).toBeNull();
  });

  it("holds the in-memory user token", () => {
    expect(getUserToken()).toBeNull();
    setUserToken("tok-123");
    expect(getUserToken()).toBe("tok-123");
    setUserToken("");
    expect(getUserToken()).toBeNull();
  });

  it("validates base URLs", () => {
    expect(isValidBaseURL("https://a.b")).toBe(true);
    expect(isValidBaseURL("not a url")).toBe(false);
  });
});
