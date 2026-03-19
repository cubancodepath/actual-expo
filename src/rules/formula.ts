/**
 * Lightweight formula evaluator — replaces HyperFormula for React Native.
 *
 * HyperFormula uses Chevrotain for parsing which causes stack overflows on Hermes
 * (128 native frame limit). This evaluator handles the subset of formulas that
 * Actual Budget rules typically use:
 *
 * - Arithmetic: +, -, *, /
 * - Parentheses
 * - Variable references (transaction field names)
 * - Built-in functions: INTEGER_TO_AMOUNT, FIXED, ABS, ROUND, FLOOR, CEIL, MIN, MAX
 */

type Token =
  | { type: "number"; value: number }
  | { type: "ident"; value: string }
  | { type: "op"; value: string }
  | { type: "lparen" }
  | { type: "rparen" }
  | { type: "comma" };

function tokenize(formula: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < formula.length) {
    const ch = formula[i];

    // Skip whitespace
    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
      i++;
      continue;
    }

    // Numbers (including decimals and negative literals after operators)
    if (ch >= "0" && ch <= "9") {
      let num = "";
      while (
        i < formula.length &&
        ((formula[i] >= "0" && formula[i] <= "9") || formula[i] === ".")
      ) {
        num += formula[i++];
      }
      tokens.push({ type: "number", value: parseFloat(num) });
      continue;
    }

    // Identifiers (variable names or function names)
    if ((ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z") || ch === "_") {
      let ident = "";
      while (
        i < formula.length &&
        ((formula[i] >= "a" && formula[i] <= "z") ||
          (formula[i] >= "A" && formula[i] <= "Z") ||
          (formula[i] >= "0" && formula[i] <= "9") ||
          formula[i] === "_")
      ) {
        ident += formula[i++];
      }
      tokens.push({ type: "ident", value: ident });
      continue;
    }

    // Operators
    if (ch === "+" || ch === "-" || ch === "*" || ch === "/") {
      tokens.push({ type: "op", value: ch });
      i++;
      continue;
    }

    if (ch === "(") {
      tokens.push({ type: "lparen" });
      i++;
      continue;
    }
    if (ch === ")") {
      tokens.push({ type: "rparen" });
      i++;
      continue;
    }
    if (ch === ",") {
      tokens.push({ type: "comma" });
      i++;
      continue;
    }

    throw new Error(`Unexpected character: ${ch} at position ${i}`);
  }

  return tokens;
}

// ── Recursive descent parser ──

class Parser {
  private tokens: Token[];
  private pos = 0;
  private variables: Record<string, number>;

  constructor(tokens: Token[], variables: Record<string, number>) {
    this.tokens = tokens;
    this.variables = variables;
  }

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private consume(): Token {
    return this.tokens[this.pos++];
  }

  private peekOp(): string | null {
    const t = this.peek();
    return t?.type === "op" ? t.value : null;
  }

  // expr = term (('+' | '-') term)*
  parseExpr(): number {
    let left = this.parseTerm();
    let op = this.peekOp();
    while (op === "+" || op === "-") {
      this.consume();
      const right = this.parseTerm();
      left = op === "+" ? left + right : left - right;
      op = this.peekOp();
    }
    return left;
  }

  // term = unary (('*' | '/') unary)*
  private parseTerm(): number {
    let left = this.parseUnary();
    let op = this.peekOp();
    while (op === "*" || op === "/") {
      this.consume();
      const right = this.parseUnary();
      left = op === "*" ? left * right : left / right;
      op = this.peekOp();
    }
    return left;
  }

  // unary = ('-' | '+')? primary
  private parseUnary(): number {
    const op = this.peekOp();
    if (op === "-" || op === "+") {
      this.consume();
      const val = this.parsePrimary();
      return op === "-" ? -val : val;
    }
    return this.parsePrimary();
  }

  // primary = number | ident | ident '(' args ')' | '(' expr ')'
  private parsePrimary(): number {
    const token = this.peek();
    if (!token) throw new Error("Unexpected end of formula");

    if (token.type === "number") {
      this.consume();
      return token.value;
    }

    if (token.type === "ident") {
      this.consume();
      const name = token.value;

      // Function call
      if (this.peek()?.type === "lparen") {
        this.consume(); // consume '('
        const args: number[] = [];
        if (this.peek()?.type !== "rparen") {
          args.push(this.parseExpr());
          while (this.peek()?.type === "comma") {
            this.consume();
            args.push(this.parseExpr());
          }
        }
        if (this.peek()?.type !== "rparen") throw new Error("Expected ')' after function args");
        this.consume();
        return this.callFunction(name, args);
      }

      // Variable reference
      const upper = name.toUpperCase();
      if (upper in this.variables) return this.variables[upper];
      if (name in this.variables) return this.variables[name];
      // Unknown variable = 0
      return 0;
    }

    if (token.type === "lparen") {
      this.consume();
      const val = this.parseExpr();
      if (this.peek()?.type !== "rparen") throw new Error("Expected ')'");
      this.consume();
      return val;
    }

    throw new Error(`Unexpected token: ${JSON.stringify(token)}`);
  }

  private callFunction(name: string, args: number[]): number {
    switch (name.toUpperCase()) {
      case "INTEGER_TO_AMOUNT": {
        const intAmount = args[0] ?? 0;
        const decimals = args[1] ?? 2;
        return intAmount / Math.pow(10, decimals);
      }
      case "FIXED":
        return Number(Number(args[0] ?? 0).toFixed(args[1] ?? 0));
      case "ABS":
        return Math.abs(args[0] ?? 0);
      case "ROUND":
        return Math.round(args[0] ?? 0);
      case "FLOOR":
        return Math.floor(args[0] ?? 0);
      case "CEIL":
        return Math.ceil(args[0] ?? 0);
      case "MIN":
        return Math.min(...args);
      case "MAX":
        return Math.max(...args);
      case "MOD":
        return (args[0] ?? 0) % (args[1] ?? 1);
      default:
        throw new Error(`Unknown function: ${name}`);
    }
  }
}

/**
 * Evaluate a formula string with variable bindings.
 * Formulas must start with '='.
 *
 * @example
 * evaluateFormula("=amount*0.1", { amount: 5000 }) // => 500
 * evaluateFormula("=amount-500", { amount: 5000 }) // => 4500
 * evaluateFormula("=INTEGER_TO_AMOUNT(amount, 2)", { amount: 5000 }) // => 50
 */
export function evaluateFormula(formula: string, variables: Record<string, number>): number {
  if (!formula || !formula.startsWith("=")) {
    throw new Error("Formula must start with =");
  }

  const expr = formula.slice(1).trim();
  if (!expr) throw new Error("Empty formula");

  const tokens = tokenize(expr);
  const parser = new Parser(tokens, variables);
  return parser.parseExpr();
}

/**
 * Convert amount to integer (matching loot-core's amountToInteger).
 * Rounds to 2 decimal places then multiplies by 100.
 */
export function amountToInteger(amount: number): number {
  return Math.round(amount * 100);
}
