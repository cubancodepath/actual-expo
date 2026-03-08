/**
 * Arithmetic expression evaluator for inline calculator input.
 *
 * Ported from Actual Budget's loot-core/shared/arithmetic.ts,
 * simplified for mobile budget input (no currency symbols, no exponents,
 * no parentheses — just +, -, *, /).
 *
 * Operator precedence: * and / bind tighter than + and -.
 * All values are in dollar amounts (not cents).
 */

type ParserState = { str: string; index: number };

type Operator = '+' | '-' | '*' | '/';
type AstNode = number | { op: Operator; left: AstNode; right: AstNode };

// ── Parser helpers ──────────────────────────────────────────────────────────

function char(state: ParserState): string | undefined {
  return state.str[state.index];
}

function next(state: ParserState): string | null {
  if (state.index >= state.str.length) return null;
  const ch = char(state);
  state.index++;
  return ch ?? null;
}

// ── Number parsing ──────────────────────────────────────────────────────────

function parsePrimary(state: ParserState): number {
  const isNegative = char(state) === '-';
  if (isNegative) next(state);

  let numStr = '';
  let currentChar = char(state);
  while (currentChar && /[0-9.]/.test(currentChar)) {
    numStr += next(state);
    currentChar = char(state);
  }

  if (numStr === '') throw new Error('Expected number');

  const value = parseFloat(numStr);
  if (isNaN(value)) throw new Error('Invalid number');
  return isNegative ? -value : value;
}

// ── Precedence climbing ─────────────────────────────────────────────────────

function parseMultiplicative(state: ParserState): AstNode {
  let node: AstNode = parsePrimary(state);
  while (char(state) === '*' || char(state) === '/') {
    const op = next(state) as '*' | '/';
    node = { op, left: node, right: parsePrimary(state) };
  }
  return node;
}

function parseAdditive(state: ParserState): AstNode {
  let node: AstNode = parseMultiplicative(state);
  while (char(state) === '+' || char(state) === '-') {
    const op = next(state) as '+' | '-';
    node = { op, left: node, right: parseMultiplicative(state) };
  }
  return node;
}

// ── AST evaluation ──────────────────────────────────────────────────────────

function evaluate(ast: AstNode): number {
  if (typeof ast === 'number') return ast;

  const left = evaluate(ast.left);
  const right = evaluate(ast.right);

  switch (ast.op) {
    case '+': return left + right;
    case '-': return left - right;
    case '*': return left * right;
    case '/': return right === 0 ? 0 : left / right;
  }
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Evaluate an arithmetic expression string.
 *
 * @param expression  e.g. "1.50+0.75", "300/2", "10*3-5"
 * @param defaultValue  returned on empty/invalid input (default: null)
 * @returns result as a dollar amount, or defaultValue on error
 *
 * @example evalArithmetic("50+25")   // 75
 * @example evalArithmetic("300/2")   // 150
 * @example evalArithmetic("")        // null
 * @example evalArithmetic("abc")     // null
 */
export function evalArithmetic(
  expression: string,
  defaultValue: number | null = null,
): number | null {
  if (expression.trim() === '') return defaultValue;

  try {
    const state = { str: expression.replace(/\s/g, ''), index: 0 };
    const result = evaluate(parseAdditive(state));
    return isNaN(result) ? defaultValue : result;
  } catch {
    return defaultValue;
  }
}

/**
 * Check whether a string contains any arithmetic operator.
 * Useful to detect if a user typed an expression vs a plain number.
 */
export function hasOperator(str: string): boolean {
  // Skip leading minus (negative number) — only check after first char
  const trimmed = str.trim();
  if (trimmed.length <= 1) return false;
  return /[+\-*/]/.test(trimmed.slice(1));
}
