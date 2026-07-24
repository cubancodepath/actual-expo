/**
 * Flat, non-recursive scanner. Turns a formula body (the text after the leading
 * '=') into a token stream. Being a plain loop, it never touches the native call
 * stack the way a generated parser would — this is the whole point of the
 * package (Hermes safety).
 */

export type TokenType =
  | "NUMBER"
  | "STRING"
  | "IDENT"
  | "OP"
  | "LPAREN"
  | "RPAREN"
  | "LBRACE"
  | "RBRACE"
  | "COMMA"
  | "SEMICOLON";

export type Token = {
  type: TokenType;
  value: string;
  /** For NUMBER tokens, the parsed numeric value. */
  num?: number;
};

const isDigit = (ch: string): boolean => ch >= "0" && ch <= "9";
const isIdentStart = (ch: string): boolean =>
  (ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z") || ch === "_";
const isIdentPart = (ch: string): boolean => isIdentStart(ch) || isDigit(ch) || ch === ".";

export class TokenizeError extends Error {}

export function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const n = input.length;

  while (i < n) {
    const ch = input[i];

    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
      i++;
      continue;
    }

    // Numbers: digits with optional decimal and exponent.
    if (isDigit(ch) || (ch === "." && isDigit(input[i + 1] ?? ""))) {
      let s = "";
      while (i < n && (isDigit(input[i]) || input[i] === ".")) {
        s += input[i++];
      }
      if (input[i] === "e" || input[i] === "E") {
        s += input[i++];
        if (input[i] === "+" || input[i] === "-") {
          s += input[i++];
        }
        while (i < n && isDigit(input[i])) {
          s += input[i++];
        }
      }
      tokens.push({ type: "NUMBER", value: s, num: parseFloat(s) });
      continue;
    }

    // String literals, "…" or '…'. Doubled quote is an escaped quote.
    if (ch === '"' || ch === "'") {
      const quote = ch;
      i++;
      let s = "";
      while (i < n) {
        if (input[i] === quote) {
          if (input[i + 1] === quote) {
            s += quote;
            i += 2;
            continue;
          }
          break;
        }
        if (input[i] === "\\" && i + 1 < n) {
          i++;
          s += input[i++];
          continue;
        }
        s += input[i++];
      }
      if (i >= n) {
        throw new TokenizeError("Unterminated string literal");
      }
      i++; // closing quote
      tokens.push({ type: "STRING", value: s });
      continue;
    }

    // Identifiers (function names / named expressions).
    if (isIdentStart(ch)) {
      let s = "";
      while (i < n && isIdentPart(input[i])) {
        s += input[i++];
      }
      tokens.push({ type: "IDENT", value: s });
      continue;
    }

    // Two-char comparison operators.
    const two = input.slice(i, i + 2);
    if (two === "<=" || two === ">=" || two === "<>") {
      tokens.push({ type: "OP", value: two });
      i += 2;
      continue;
    }

    switch (ch) {
      case "+":
      case "-":
      case "*":
      case "/":
      case "^":
      case "&":
      case "%":
      case "=":
      case "<":
      case ">":
        tokens.push({ type: "OP", value: ch });
        i++;
        continue;
      case "(":
        tokens.push({ type: "LPAREN", value: ch });
        i++;
        continue;
      case ")":
        tokens.push({ type: "RPAREN", value: ch });
        i++;
        continue;
      case "{":
        tokens.push({ type: "LBRACE", value: ch });
        i++;
        continue;
      case "}":
        tokens.push({ type: "RBRACE", value: ch });
        i++;
        continue;
      case ",":
        tokens.push({ type: "COMMA", value: ch });
        i++;
        continue;
      case ";":
        tokens.push({ type: "SEMICOLON", value: ch });
        i++;
        continue;
      default:
        throw new TokenizeError(`Unexpected character "${ch}" at position ${i}`);
    }
  }

  return tokens;
}
