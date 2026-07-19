/**
 * Lightweight formula evaluator — replaces HyperFormula for React Native.
 *
 * HyperFormula uses Chevrotain for parsing which causes stack overflows on Hermes
 * (128 native frame limit). This evaluator handles the subset of formulas that
 * Actual Budget rules typically use:
 *
 * - Arithmetic: +, -, *, /
 * - Comparison: >, <, >=, <=, =, <> (return 1 for true, 0 for false)
 * - Parentheses
 * - String literals: "text" or 'text'
 * - Variable references (transaction field names — numbers only)
 * - Built-in functions: INTEGER_TO_AMOUNT, FIXED, ABS, ROUND, FLOOR, CEIL,
 *                       MIN, MAX, MOD, IF, CONCAT, LEN, LOWER, UPPER, TRIM
 */

export type FormulaValue = number | string;

type Token =
  | { type: "number"; value: number }
  | { type: "string"; value: string }
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

    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
      i++;
      continue;
    }

    // Numbers
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

    // String literals ("..." or '...')
    if (ch === '"' || ch === "'") {
      const quote = ch;
      i++;
      let str = "";
      while (i < formula.length && formula[i] !== quote) {
        if (formula[i] === "\\" && i + 1 < formula.length) {
          i++;
          str += formula[i++];
        } else {
          str += formula[i++];
        }
      }
      if (i >= formula.length) throw new Error("Unterminated string literal");
      i++; // consume closing quote
      tokens.push({ type: "string", value: str });
      continue;
    }

    // Identifiers
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

    // Multi-char comparison operators (must check before single-char)
    if (ch === ">" && formula[i + 1] === "=") {
      tokens.push({ type: "op", value: ">=" });
      i += 2;
      continue;
    }
    if (ch === "<" && formula[i + 1] === "=") {
      tokens.push({ type: "op", value: "<=" });
      i += 2;
      continue;
    }
    if (ch === "<" && formula[i + 1] === ">") {
      tokens.push({ type: "op", value: "<>" });
      i += 2;
      continue;
    }

    // Single-char operators
    if (
      ch === "+" ||
      ch === "-" ||
      ch === "*" ||
      ch === "/" ||
      ch === ">" ||
      ch === "<" ||
      ch === "="
    ) {
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

    throw new Error(`Unexpected character: "${ch}" at position ${i}`);
  }

  return tokens;
}

// ── Recursive descent parser ──

const COMPARISON_OPS = new Set(["<", ">", "<=", ">=", "=", "<>"]);

class Parser {
  private tokens: Token[];
  private pos = 0;
  private variables: Record<string, FormulaValue>;
  private balanceOf?: Map<string, number>;

  constructor(
    tokens: Token[],
    variables: Record<string, FormulaValue>,
    balanceOf?: Map<string, number>,
  ) {
    this.tokens = tokens;
    this.variables = variables;
    this.balanceOf = balanceOf;
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

  // Top-level: comparison = arith (compOp arith)?
  parseExpr(): FormulaValue {
    const left = this.parseArith();
    const op = this.peekOp();
    if (op && COMPARISON_OPS.has(op)) {
      this.consume();
      const right = this.parseArith();
      return this.compare(op, left, right);
    }
    return left;
  }

  // arith = term (('+' | '-') term)*
  private parseArith(): FormulaValue {
    let left = this.parseTerm();
    let op = this.peekOp();
    while (op === "+" || op === "-") {
      this.consume();
      const right = this.parseTerm();
      // String concatenation with +
      if (typeof left === "string" || typeof right === "string") {
        left = String(left) + String(right);
      } else {
        left = op === "+" ? left + right : left - right;
      }
      op = this.peekOp();
    }
    return left;
  }

  // term = unary (('*' | '/') unary)*
  private parseTerm(): FormulaValue {
    let left = this.parseUnary();
    let op = this.peekOp();
    while (op === "*" || op === "/") {
      this.consume();
      const right = this.parseUnary();
      const l = typeof left === "string" ? parseFloat(left) || 0 : left;
      const r = typeof right === "string" ? parseFloat(right) || 0 : right;
      left = op === "*" ? l * r : l / r;
      op = this.peekOp();
    }
    return left;
  }

  // unary = ('-' | '+')? primary
  private parseUnary(): FormulaValue {
    const op = this.peekOp();
    if (op === "-" || op === "+") {
      this.consume();
      const val = this.parsePrimary();
      const n = typeof val === "string" ? parseFloat(val) || 0 : val;
      return op === "-" ? -n : n;
    }
    return this.parsePrimary();
  }

  // primary = number | string | ident | ident '(' args ')' | '(' expr ')'
  private parsePrimary(): FormulaValue {
    const token = this.peek();
    if (!token) throw new Error("Unexpected end of formula");

    if (token.type === "number") {
      this.consume();
      return token.value;
    }

    if (token.type === "string") {
      this.consume();
      return token.value;
    }

    if (token.type === "ident") {
      this.consume();
      const name = token.value;

      if (this.peek()?.type === "lparen") {
        this.consume(); // '('
        const args: FormulaValue[] = [];
        if (this.peek()?.type !== "rparen") {
          args.push(this.parseExpr());
          while (this.peek()?.type === "comma") {
            this.consume();
            args.push(this.parseExpr());
          }
        }
        if (this.peek()?.type !== "rparen")
          throw new Error(`Expected ')' after arguments for ${name}()`);
        this.consume();
        return this.callFunction(name, args);
      }

      // Variable reference — case-insensitive lookup
      const upper = name.toUpperCase();
      if (upper in this.variables) return this.variables[upper];
      if (name in this.variables) return this.variables[name];
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

  private compare(op: string, left: FormulaValue, right: FormulaValue): number {
    // Numeric comparison if both are numbers, string comparison otherwise
    if (typeof left === "number" && typeof right === "number") {
      switch (op) {
        case ">":
          return left > right ? 1 : 0;
        case "<":
          return left < right ? 1 : 0;
        case ">=":
          return left >= right ? 1 : 0;
        case "<=":
          return left <= right ? 1 : 0;
        case "=":
          return left === right ? 1 : 0;
        case "<>":
          return left !== right ? 1 : 0;
      }
    } else {
      const l = String(left);
      const r = String(right);
      switch (op) {
        case ">":
          return l > r ? 1 : 0;
        case "<":
          return l < r ? 1 : 0;
        case ">=":
          return l >= r ? 1 : 0;
        case "<=":
          return l <= r ? 1 : 0;
        case "=":
          return l === r ? 1 : 0;
        case "<>":
          return l !== r ? 1 : 0;
      }
    }
    return 0;
  }

  private callFunction(name: string, args: FormulaValue[]): FormulaValue {
    const nums = args.map((a) => (typeof a === "number" ? a : parseFloat(String(a)) || 0));

    switch (name.toUpperCase()) {
      case "IF": {
        if (args.length < 3)
          throw new Error("IF() requires 3 arguments: IF(condition, true_value, false_value)");
        const cond = typeof args[0] === "number" ? args[0] : args[0] ? 1 : 0;
        return cond !== 0 ? args[1] : args[2];
      }
      case "INTEGER_TO_AMOUNT": {
        const decimals = nums[1] ?? 2;
        return nums[0] / Math.pow(10, decimals);
      }
      case "FIXED":
        return Number(nums[0].toFixed(nums[1] ?? 0));
      case "ABS":
        return Math.abs(nums[0]);
      case "ROUND":
        return Math.round(nums[0]);
      case "FLOOR":
        return Math.floor(nums[0]);
      case "CEIL":
        return Math.ceil(nums[0]);
      case "MIN":
        return Math.min(...nums);
      case "MAX":
        return Math.max(...nums);
      case "MOD":
        return nums[0] % (nums[1] ?? 1);
      case "CONCAT":
        return args.map(String).join("");
      case "LEN":
        return String(args[0] ?? "").length;
      case "LOWER":
        return String(args[0] ?? "").toLowerCase();
      case "UPPER":
        return String(args[0] ?? "").toUpperCase();
      case "TRIM":
        return String(args[0] ?? "").trim();
      case "BALANCE_OF":
        // Running balance of the named account, prefetched before eval.
        return this.balanceOf?.get(String(args[0] ?? "")) ?? 0;
      default:
        throw new Error(
          `Unknown formula function: ${name}. ` +
            `Supported: IF, INTEGER_TO_AMOUNT, FIXED, ABS, ROUND, FLOOR, CEIL, MIN, MAX, MOD, CONCAT, LEN, LOWER, UPPER, TRIM, BALANCE_OF`,
        );
    }
  }
}

/**
 * Evaluate a formula string with variable bindings.
 * Formulas must start with '='.
 *
 * Returns a number or string depending on the formula result.
 *
 * @example
 * evaluateFormula("=amount*0.1", { amount: 5000 })           // => 500
 * evaluateFormula("=IF(amount>0, amount, 0)", { amount: -100 }) // => 0
 * evaluateFormula('=IF(amount>0, "income", "expense")', { amount: 100 }) // => "income"
 * evaluateFormula("=CONCAT(notes, \" (auto)\")", { notes: "Rent" }) // => "Rent (auto)"
 */
export function evaluateFormula(
  formula: string,
  variables: Record<string, FormulaValue>,
  balanceOf?: Map<string, number>,
): FormulaValue {
  if (!formula || !formula.startsWith("=")) {
    throw new Error("Formula must start with =");
  }

  const expr = formula.slice(1).trim();
  if (!expr) throw new Error("Empty formula");

  const tokens = tokenize(expr);
  const parser = new Parser(tokens, variables, balanceOf);
  return parser.parseExpr();
}

/**
 * Convert amount to integer (matching loot-core's amountToInteger).
 * Rounds to 2 decimal places then multiplies by 100.
 */
export function amountToInteger(amount: number): number {
  return Math.round(amount * 100);
}
