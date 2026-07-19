import { describe, expect, it } from "vitest";
import { isExpectedOpenIdCallback } from "./isExpectedOpenIdCallback";

const HOSTNAME = "budget.example.com";
const VALID_URL = `actualbudget://${HOSTNAME}/openid-cb?token=abc123`;

describe("isExpectedOpenIdCallback", () => {
  it("passes for the correct scheme, hostname and path", () => {
    expect(isExpectedOpenIdCallback(VALID_URL, HOSTNAME)).toBe(true);
  });

  it("tolerates extra/unrelated query params", () => {
    const url = `actualbudget://${HOSTNAME}/openid-cb?token=abc123&foo=bar&utm_source=x`;
    expect(isExpectedOpenIdCallback(url, HOSTNAME)).toBe(true);
  });

  it("fails for the wrong scheme", () => {
    const url = `evilapp://${HOSTNAME}/openid-cb?token=abc123`;
    expect(isExpectedOpenIdCallback(url, HOSTNAME)).toBe(false);
  });

  it("fails for the wrong hostname", () => {
    const url = `actualbudget://attacker.example.com/openid-cb?token=abc123`;
    expect(isExpectedOpenIdCallback(url, HOSTNAME)).toBe(false);
  });

  it("fails for the wrong path", () => {
    const url = `actualbudget://${HOSTNAME}/not-the-callback?token=abc123`;
    expect(isExpectedOpenIdCallback(url, HOSTNAME)).toBe(false);
  });

  it("fails for an unparseable URL", () => {
    expect(isExpectedOpenIdCallback("not a url", HOSTNAME)).toBe(false);
  });

  it("passes in nonce mode when state matches", () => {
    const nonce = "nonce-123";
    const url = `actualbudget://${HOSTNAME}/openid-cb?token=abc123&state=${nonce}`;
    expect(isExpectedOpenIdCallback(url, HOSTNAME, nonce)).toBe(true);
  });

  it("fails in nonce mode when state is missing", () => {
    const nonce = "nonce-123";
    expect(isExpectedOpenIdCallback(VALID_URL, HOSTNAME, nonce)).toBe(false);
  });

  it("fails in nonce mode when state mismatches", () => {
    const nonce = "nonce-123";
    const url = `actualbudget://${HOSTNAME}/openid-cb?token=abc123&state=wrong-nonce`;
    expect(isExpectedOpenIdCallback(url, HOSTNAME, nonce)).toBe(false);
  });
});
