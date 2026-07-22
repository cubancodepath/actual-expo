import { beforeEach, describe, expect, it } from "vitest";
import {
  setNumberFormat,
  formatBalance,
  formatAmount,
  formatAmountShort,
  localeForNumberFormat,
  getFractionDigits,
  normalizeNumberFor,
  type NumberFormatType,
} from "./format";

// Normalize every kind of space (narrow no-break U+202F, no-break U+00A0,
// regular) to a plain space so grouping assertions don't hinge on the exact
// codepoint the platform's ICU emits.
const norm = (s: string) => s.replace(/[   ]/g, " ");

describe("format — numberFormat separators (upstream parity)", () => {
  beforeEach(() => setNumberFormat({ format: "comma-dot", hideFraction: false }));

  const cases: { format: NumberFormatType; expected: string }[] = [
    { format: "comma-dot", expected: "12,345.67" },
    { format: "dot-comma", expected: "12.345,67" },
    { format: "space-comma", expected: "12 345,67" },
    { format: "comma-dot-in", expected: "12,345.67" },
  ];

  for (const { format, expected } of cases) {
    it(`formats ${format} → ${expected}`, () => {
      setNumberFormat({ format, hideFraction: false });
      expect(norm(formatBalance(1234567))).toBe(expected);
    });
  }

  it("apostrophe-dot uses U+2019 and a dot decimal", () => {
    setNumberFormat({ format: "apostrophe-dot", hideFraction: false });
    const out = formatBalance(1234567);
    expect(out).toContain("’"); // U+2019, never a keyboard '
    expect(out).not.toContain("'");
    expect(out.endsWith(".67")).toBe(true);
  });

  it("comma-dot-in uses Indian grouping for large numbers", () => {
    setNumberFormat({ format: "comma-dot-in", hideFraction: false });
    // 123456.78 → 1,23,456.78 (last group of 3, then groups of 2)
    expect(norm(formatBalance(12345678))).toBe("1,23,456.78");
  });
});

describe("format — hideFraction", () => {
  it("drops decimals when hideFraction is on", () => {
    setNumberFormat({ format: "comma-dot", hideFraction: true });
    expect(norm(formatBalance(1234567))).toBe("12,346"); // rounded, no decimals
  });

  it("keeps decimals when off", () => {
    setNumberFormat({ format: "comma-dot", hideFraction: false });
    expect(norm(formatBalance(1234567))).toBe("12,345.67");
  });
});

describe("format — signed variants", () => {
  beforeEach(() => setNumberFormat({ format: "comma-dot", hideFraction: false }));

  it("formatAmount adds + for positive, - for negative", () => {
    expect(norm(formatAmount(1234567))).toBe("+12,345.67");
    expect(norm(formatAmount(-1234567))).toBe("-12,345.67");
    expect(norm(formatAmount(0))).toBe("0.00");
  });

  it("formatAmountShort drops decimals and the + sign", () => {
    expect(norm(formatAmountShort(1234567))).toBe("12,346");
    expect(norm(formatAmountShort(-1234567))).toBe("-12,346");
  });
});

describe("format — config helpers", () => {
  it("localeForNumberFormat maps each format to its Intl locale", () => {
    expect(localeForNumberFormat("comma-dot")).toBe("en-US");
    expect(localeForNumberFormat("dot-comma")).toBe("de-DE");
    expect(localeForNumberFormat("space-comma")).toBe("fr-FR");
    expect(localeForNumberFormat("apostrophe-dot")).toBe("de-CH");
    expect(localeForNumberFormat("comma-dot-in")).toBe("en-IN");
  });

  it("getFractionDigits is 0 when hidden, 2 otherwise", () => {
    expect(getFractionDigits(true)).toBe(0);
    expect(getFractionDigits(false)).toBe(2);
  });

  it("normalizeNumberFor only rewrites the apostrophe format", () => {
    expect(normalizeNumberFor("apostrophe-dot", "12'345.67")).toBe("12’345.67");
    expect(normalizeNumberFor("comma-dot", "12,345.67")).toBe("12,345.67");
  });
});
