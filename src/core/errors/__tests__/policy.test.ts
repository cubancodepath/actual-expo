import { describe, expect, it } from "vitest";
import type { ErrorCode } from "../codes";
import { CODE_META } from "../codes";
import { ERROR_POLICY, type ErrorPolicy } from "../policy";

const ALL_CODES = Object.keys(CODE_META) as ErrorCode[];
const POLICY: Record<ErrorCode, ErrorPolicy> = ERROR_POLICY;

describe("ERROR_POLICY", () => {
  it("has an entry for every ErrorCode", () => {
    for (const code of ALL_CODES) {
      expect(POLICY[code], `missing policy for "${code}"`).toBeDefined();
    }
  });

  it("has no orphaned entries beyond ErrorCode", () => {
    const policyCodes = Object.keys(POLICY);
    expect(policyCodes.sort()).toEqual(ALL_CODES.sort());
  });

  it("only redirect-login actions pair with silent display", () => {
    for (const code of ALL_CODES) {
      const policy = POLICY[code];
      if (policy.action === "redirect-login") {
        expect(policy.display, `${code} should stay silent while redirecting`).toBe("silent");
      }
    }
  });
});

describe("CODE_META", () => {
  it("every code has a non-empty messageKey under the errors namespace", () => {
    for (const code of ALL_CODES) {
      expect(CODE_META[code].messageKey).toMatch(/^errors:/);
    }
  });
});
