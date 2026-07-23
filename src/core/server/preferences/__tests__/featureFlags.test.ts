import { describe, it, expect } from "vitest";
import {
  ALL_FEATURE_FLAGS,
  DEFAULT_FEATURE_FLAG_STATE,
  defaultFlagPrefs,
  flagFromKey,
  flagKey,
  isFlagKey,
  parseFlagValue,
  serializeFlagValue,
} from "../featureFlags";

describe("flagKey / flagFromKey / isFlagKey", () => {
  it("round-trips every flag through flagKey/flagFromKey", () => {
    for (const flag of ALL_FEATURE_FLAGS) {
      expect(flagFromKey(flagKey(flag))).toBe(flag);
    }
  });

  it("recognizes derived flag keys", () => {
    for (const flag of ALL_FEATURE_FLAGS) {
      expect(isFlagKey(flagKey(flag))).toBe(true);
    }
  });

  it("rejects non-flag keys", () => {
    expect(isFlagKey("dateFormat")).toBe(false);
    expect(isFlagKey("flags.notAFlag")).toBe(false);
    expect(isFlagKey("flagsX")).toBe(false);
  });
});

describe("parseFlagValue", () => {
  it("falls back to the default when the value is missing", () => {
    expect(parseFlagValue("goalTemplatesEnabled", undefined)).toBe(
      DEFAULT_FEATURE_FLAG_STATE.goalTemplatesEnabled,
    );
    expect(parseFlagValue("goalTemplatesEnabled", null)).toBe(
      DEFAULT_FEATURE_FLAG_STATE.goalTemplatesEnabled,
    );
  });

  it("parses the string 'true' as enabled", () => {
    expect(parseFlagValue("currency", "true")).toBe(true);
  });

  it("treats anything other than the string 'true' as disabled", () => {
    expect(parseFlagValue("currency", "false")).toBe(false);
    expect(parseFlagValue("currency", "")).toBe(false);
    expect(parseFlagValue("currency", "1")).toBe(false);
  });
});

describe("serializeFlagValue", () => {
  it("produces the exact wire strings upstream expects", () => {
    expect(serializeFlagValue(true)).toBe("true");
    expect(serializeFlagValue(false)).toBe("false");
  });
});

describe("defaultFlagPrefs", () => {
  it("has one entry per flag, keyed by the prefixed name", () => {
    const prefs = defaultFlagPrefs();
    expect(Object.keys(prefs).sort()).toEqual(ALL_FEATURE_FLAGS.map(flagKey).sort());
  });

  it("encodes defaults as 'true'/'false' strings", () => {
    const prefs = defaultFlagPrefs();
    for (const flag of ALL_FEATURE_FLAGS) {
      expect(prefs[flagKey(flag)]).toBe(serializeFlagValue(DEFAULT_FEATURE_FLAG_STATE[flag]));
    }
  });
});
