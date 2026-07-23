import { describe, it, expect } from "vitest";
import {
  collectFormulasFromActions,
  extractBalanceOfLiterals,
  resolveAccountIdForBalanceOf,
  decodeBalanceOfQuotedLiteral,
} from "./balanceOfFormula";

describe("balanceOfFormula helpers", () => {
  it("collects formula strings from action options", () => {
    expect(
      collectFormulasFromActions([
        { options: { formula: "=amount*2" } },
        { options: {} },
        {},
        { options: { formula: '=BALANCE_OF("A")' } },
      ]),
    ).toEqual(["=amount*2", '=BALANCE_OF("A")']);
  });

  it("extracts distinct BALANCE_OF literals in order", () => {
    expect(
      extractBalanceOfLiterals('=BALANCE_OF("A") + BALANCE_OF("B") - BALANCE_OF("A")'),
    ).toEqual(["A", "B"]);
  });

  it("handles whitespace and escaped quotes in the literal", () => {
    expect(extractBalanceOfLiterals('=BALANCE_OF( "My \\"Acct\\"" )')).toEqual(['My "Acct"']);
  });

  it("decodes escaped quoted literals", () => {
    expect(decodeBalanceOfQuotedLiteral('a\\"b\\\\c')).toBe('a"b\\c');
  });

  it("resolves account id by id first, then by exact name", () => {
    const map = new Map([["id1", { id: "id1", name: "Checking" }]]);
    expect(resolveAccountIdForBalanceOf("id1", map)).toBe("id1");
    expect(resolveAccountIdForBalanceOf("Checking", map)).toBe("id1");
    expect(resolveAccountIdForBalanceOf("Nope", map)).toBeNull();
  });
});
