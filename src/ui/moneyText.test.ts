import { describe, expect, it } from "vitest";
import { moneyText, type MoneyTextFormat } from "./moneyText";

const usd: MoneyTextFormat = {
  locale: "en-US",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  symbol: "$",
  symbolPosition: "before",
  spaceBetween: false,
};

const eur: MoneyTextFormat = {
  locale: "de-DE",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  symbol: "€",
  symbolPosition: "after",
  spaceBetween: true,
};

/**
 * These lock the spoken form of an amount to the visible one. `Money` composes
 * sign, symbol and digits itself, so the two can silently drift — and when they
 * drift, a screen reader starts announcing something the screen never said.
 */
describe("moneyText", () => {
  it("puts the sign outside the symbol", () => {
    expect(moneyText(-12345, usd)).toBe("-$123.45");
    expect(moneyText(-12345, eur)).toBe("-123,45 €");
  });

  it("honours symbol position and spacing", () => {
    expect(moneyText(12345, usd)).toBe("$123.45");
    expect(moneyText(12345, eur)).toBe("123,45 €");
  });

  it("omits the symbol entirely when no currency is set", () => {
    expect(moneyText(12345, { ...usd, symbol: "" })).toBe("123.45");
    expect(moneyText(-12345, { ...usd, symbol: "" })).toBe("-123.45");
  });

  it("adds a leading + only for positive amounts under showSign", () => {
    expect(moneyText(12345, usd, { showSign: true })).toBe("+$123.45");
    expect(moneyText(-12345, usd, { showSign: true })).toBe("-$123.45");
    expect(moneyText(0, usd, { showSign: true })).toBe("$0.00");
  });

  it("drops decimals under noDecimals, rounding like the display does", () => {
    expect(moneyText(12345, usd, { noDecimals: true })).toBe("$123");
    expect(moneyText(12395, usd, { noDecimals: true })).toBe("$124");
  });

  it("respects a zero-decimal currency", () => {
    const jpy: MoneyTextFormat = { ...usd, symbol: "¥", minimumFractionDigits: 0 };
    expect(moneyText(123400, jpy)).toBe("¥1,234");
  });

  it("carries no bidi control characters — speech synthesis would read them", () => {
    // `Money` wraps the symbol in LTR embedding marks for rendering; the spoken
    // string must not inherit them.
    expect(moneyText(-12345, eur)).not.toMatch(/[‪-‮⁦-⁩]/);
  });

  it("is stable across repeated calls (formatter cache reuse)", () => {
    expect(moneyText(100, usd)).toBe(moneyText(100, usd));
    expect(moneyText(100, eur)).toBe("1,00 €");
    expect(moneyText(100, usd)).toBe("$1.00");
  });
});
