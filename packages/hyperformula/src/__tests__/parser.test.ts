import { describe, expect, it } from "vitest";

import { AstNodeType, MAX_DEPTH, ParseError, parseFormula } from "../parser";
import { tokenize } from "../tokenizer";

describe("tokenizer", () => {
  it("tokenizes numbers, strings, idents and operators", () => {
    const toks = tokenize('amount * 2 + "x"');
    expect(toks.map((t) => t.type)).toEqual(["IDENT", "OP", "NUMBER", "OP", "STRING"]);
  });
  it("handles doubled-quote escapes", () => {
    const toks = tokenize('"a""b"');
    expect(toks[0]).toMatchObject({ type: "STRING", value: 'a"b' });
  });
  it("throws on unterminated string", () => {
    expect(() => tokenize('"abc')).toThrow("Unterminated string literal");
  });
});

describe("parser", () => {
  it("respects precedence (comparison < concat < additive < multiplicative)", () => {
    const ast = parseFormula("1 + 2 * 3 = 7");
    expect(ast.type).toBe(AstNodeType.EQUALS_OP);
  });
  it("parses function calls with uppercased names", () => {
    const ast = parseFormula("sum(1, 2)");
    expect(ast).toMatchObject({ type: AstNodeType.FUNCTION_CALL, procedureName: "SUM" });
  });
  it("produces STRING nodes with value (needed by custom functions)", () => {
    const ast = parseFormula('"hello"');
    expect(ast).toMatchObject({ type: AstNodeType.STRING, value: "hello" });
  });
  it("parses array literals as rows/cols", () => {
    const ast = parseFormula("{1, 2; 3, 4}");
    expect(ast.type).toBe(AstNodeType.ARRAY);
  });
  it("rejects pathological nesting instead of overflowing", () => {
    const deep = "(".repeat(MAX_DEPTH + 5) + "1" + ")".repeat(MAX_DEPTH + 5);
    expect(() => parseFormula(deep)).toThrow(ParseError);
  });
});
