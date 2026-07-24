/**
 * AST node types + a bounded recursive-descent parser.
 *
 * The recursion depth is explicitly capped (MAX_DEPTH). Formulas are tiny, so
 * this never fires in practice; when it does (a pathologically nested formula)
 * it produces a parse error instead of a Hermes native-stack overflow.
 *
 * Node `type` tags and the ProcedureAst shape ({ procedureName, args }) match
 * HyperFormula where consuming code depends on them — notably `type === 'STRING'`
 * with a `.value`, used by customFunctions.ts queryExtractCategoriesSize.
 */

import { CellError } from "./errors";
import { Token, tokenize } from "./tokenizer";

export enum AstNodeType {
  NUMBER = "NUMBER",
  STRING = "STRING",
  FUNCTION_CALL = "FUNCTION_CALL",
  NAMED_EXPRESSION = "NAMED_EXPRESSION",
  PARENTHESIS = "PARENTHESIS",
  ARRAY = "ARRAY",
  EMPTY = "EMPTY",
  ERROR = "ERROR",

  PLUS_OP = "PLUS_OP",
  MINUS_OP = "MINUS_OP",
  TIMES_OP = "TIMES_OP",
  DIV_OP = "DIV_OP",
  POWER_OP = "POWER_OP",
  CONCATENATE_OP = "CONCATENATE_OP",

  EQUALS_OP = "EQUALS_OP",
  NOT_EQUAL_OP = "NOT_EQUAL_OP",
  GREATER_THAN_OP = "GREATER_THAN_OP",
  LESS_THAN_OP = "LESS_THAN_OP",
  GREATER_THAN_OR_EQUAL_OP = "GREATER_THAN_OR_EQUAL_OP",
  LESS_THAN_OR_EQUAL_OP = "LESS_THAN_OR_EQUAL_OP",

  MINUS_UNARY_OP = "MINUS_UNARY_OP",
  PLUS_UNARY_OP = "PLUS_UNARY_OP",
  PERCENT_OP = "PERCENT_OP",
}

export type NumberAst = { type: AstNodeType.NUMBER; value: number };
export type StringAst = { type: AstNodeType.STRING; value: string };
export type NamedExpressionAst = {
  type: AstNodeType.NAMED_EXPRESSION;
  expressionName: string;
};
export type ProcedureAst = {
  type: AstNodeType.FUNCTION_CALL;
  procedureName: string;
  args: Ast[];
};
export type ParenthesisAst = {
  type: AstNodeType.PARENTHESIS;
  expression: Ast;
};
export type ArrayAst = { type: AstNodeType.ARRAY; args: Ast[][] };
export type EmptyAst = { type: AstNodeType.EMPTY };
export type ErrorAst = { type: AstNodeType.ERROR; error: CellError };

export type BinaryOpAst = {
  type:
    | AstNodeType.PLUS_OP
    | AstNodeType.MINUS_OP
    | AstNodeType.TIMES_OP
    | AstNodeType.DIV_OP
    | AstNodeType.POWER_OP
    | AstNodeType.CONCATENATE_OP
    | AstNodeType.EQUALS_OP
    | AstNodeType.NOT_EQUAL_OP
    | AstNodeType.GREATER_THAN_OP
    | AstNodeType.LESS_THAN_OP
    | AstNodeType.GREATER_THAN_OR_EQUAL_OP
    | AstNodeType.LESS_THAN_OR_EQUAL_OP;
  left: Ast;
  right: Ast;
};

export type UnaryOpAst = {
  type: AstNodeType.MINUS_UNARY_OP | AstNodeType.PLUS_UNARY_OP | AstNodeType.PERCENT_OP;
  value: Ast;
};

export type Ast =
  | NumberAst
  | StringAst
  | NamedExpressionAst
  | ProcedureAst
  | ParenthesisAst
  | ArrayAst
  | EmptyAst
  | ErrorAst
  | BinaryOpAst
  | UnaryOpAst;

export const MAX_DEPTH = 64;

export class ParseError extends Error {}

const COMPARISON_OPS: Record<string, AstNodeType> = {
  "=": AstNodeType.EQUALS_OP,
  "<>": AstNodeType.NOT_EQUAL_OP,
  ">": AstNodeType.GREATER_THAN_OP,
  "<": AstNodeType.LESS_THAN_OP,
  ">=": AstNodeType.GREATER_THAN_OR_EQUAL_OP,
  "<=": AstNodeType.LESS_THAN_OR_EQUAL_OP,
};

class Parser {
  private pos = 0;

  constructor(private readonly tokens: Token[]) {}

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private next(): Token {
    return this.tokens[this.pos++];
  }

  private expect(type: Token["type"]): Token {
    const t = this.peek();
    if (!t || t.type !== type) {
      throw new ParseError(`Expected ${type} but got ${t ? t.type : "end of input"}`);
    }
    return this.next();
  }

  private guard(depth: number): void {
    if (depth > MAX_DEPTH) {
      throw new ParseError("Formula nested too deeply");
    }
  }

  parse(): Ast {
    const ast = this.parseExpression(0);
    if (this.pos !== this.tokens.length) {
      throw new ParseError("Unexpected trailing tokens");
    }
    return ast;
  }

  // Lowest precedence: comparison operators.
  private parseExpression(depth: number): Ast {
    this.guard(depth);
    let left = this.parseConcat(depth + 1);
    let t = this.peek();
    while (t && t.type === "OP" && COMPARISON_OPS[t.value] !== undefined) {
      this.next();
      const right = this.parseConcat(depth + 1);
      left = { type: COMPARISON_OPS[t.value], left, right } as BinaryOpAst;
      t = this.peek();
    }
    return left;
  }

  private parseConcat(depth: number): Ast {
    this.guard(depth);
    let left = this.parseAdditive(depth + 1);
    let t = this.peek();
    while (t && t.type === "OP" && t.value === "&") {
      this.next();
      const right = this.parseAdditive(depth + 1);
      left = { type: AstNodeType.CONCATENATE_OP, left, right };
      t = this.peek();
    }
    return left;
  }

  private parseAdditive(depth: number): Ast {
    this.guard(depth);
    let left = this.parseMultiplicative(depth + 1);
    let t = this.peek();
    while (t && t.type === "OP" && (t.value === "+" || t.value === "-")) {
      this.next();
      const right = this.parseMultiplicative(depth + 1);
      left = {
        type: t.value === "+" ? AstNodeType.PLUS_OP : AstNodeType.MINUS_OP,
        left,
        right,
      };
      t = this.peek();
    }
    return left;
  }

  private parseMultiplicative(depth: number): Ast {
    this.guard(depth);
    let left = this.parsePower(depth + 1);
    let t = this.peek();
    while (t && t.type === "OP" && (t.value === "*" || t.value === "/")) {
      this.next();
      const right = this.parsePower(depth + 1);
      left = {
        type: t.value === "*" ? AstNodeType.TIMES_OP : AstNodeType.DIV_OP,
        left,
        right,
      };
      t = this.peek();
    }
    return left;
  }

  private parsePower(depth: number): Ast {
    this.guard(depth);
    let left = this.parseUnary(depth + 1);
    let t = this.peek();
    while (t && t.type === "OP" && t.value === "^") {
      this.next();
      const right = this.parseUnary(depth + 1);
      left = { type: AstNodeType.POWER_OP, left, right };
      t = this.peek();
    }
    return left;
  }

  private parseUnary(depth: number): Ast {
    this.guard(depth);
    const t = this.peek();
    if (t && t.type === "OP" && (t.value === "-" || t.value === "+")) {
      this.next();
      const value = this.parseUnary(depth + 1);
      return {
        type: t.value === "-" ? AstNodeType.MINUS_UNARY_OP : AstNodeType.PLUS_UNARY_OP,
        value,
      };
    }
    return this.parsePostfix(depth + 1);
  }

  private parsePostfix(depth: number): Ast {
    this.guard(depth);
    let node = this.parsePrimary(depth + 1);
    let t = this.peek();
    while (t && t.type === "OP" && t.value === "%") {
      this.next();
      node = { type: AstNodeType.PERCENT_OP, value: node };
      t = this.peek();
    }
    return node;
  }

  private parsePrimary(depth: number): Ast {
    this.guard(depth);
    const t = this.peek();
    if (!t) {
      throw new ParseError("Unexpected end of formula");
    }

    if (t.type === "NUMBER") {
      this.next();
      return { type: AstNodeType.NUMBER, value: t.num ?? parseFloat(t.value) };
    }

    if (t.type === "STRING") {
      this.next();
      return { type: AstNodeType.STRING, value: t.value };
    }

    if (t.type === "LPAREN") {
      this.next();
      const expression = this.parseExpression(depth + 1);
      this.expect("RPAREN");
      return { type: AstNodeType.PARENTHESIS, expression };
    }

    if (t.type === "LBRACE") {
      return this.parseArray(depth + 1);
    }

    if (t.type === "IDENT") {
      this.next();
      const name = t.value;
      if (this.peek()?.type === "LPAREN") {
        this.next(); // (
        const args = this.parseArgs(depth + 1);
        this.expect("RPAREN");
        return { type: AstNodeType.FUNCTION_CALL, procedureName: name.toUpperCase(), args };
      }
      return { type: AstNodeType.NAMED_EXPRESSION, expressionName: name };
    }

    throw new ParseError(`Unexpected token ${t.type}`);
  }

  private parseArgs(depth: number): Ast[] {
    const args: Ast[] = [];
    if (this.peek()?.type === "RPAREN") {
      return args;
    }
    args.push(this.parseArgOrEmpty(depth));
    while (this.peek()?.type === "COMMA") {
      this.next();
      args.push(this.parseArgOrEmpty(depth));
    }
    return args;
  }

  private parseArgOrEmpty(depth: number): Ast {
    const t = this.peek();
    if (!t || t.type === "COMMA" || t.type === "RPAREN") {
      return { type: AstNodeType.EMPTY };
    }
    return this.parseExpression(depth + 1);
  }

  // Array literal {a, b; c, d} — ',' separates columns, ';' separates rows.
  private parseArray(depth: number): Ast {
    this.expect("LBRACE");
    const rows: Ast[][] = [];
    let currentRow: Ast[] = [this.parseExpression(depth + 1)];
    let t = this.peek();
    while (t && (t.type === "COMMA" || t.type === "SEMICOLON")) {
      this.next();
      if (t.type === "SEMICOLON") {
        rows.push(currentRow);
        currentRow = [];
      }
      currentRow.push(this.parseExpression(depth + 1));
      t = this.peek();
    }
    rows.push(currentRow);
    this.expect("RBRACE");
    return { type: AstNodeType.ARRAY, args: rows };
  }
}

/** Parse a formula body (text after the leading '=') into an AST. */
export function parseFormula(body: string): Ast {
  return new Parser(tokenize(body)).parse();
}
