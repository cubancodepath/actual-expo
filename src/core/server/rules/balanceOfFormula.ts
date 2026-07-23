/**
 * BALANCE_OF("account") formula support.
 * Ported from loot-core/src/server/rules/balanceOfFormula.ts.
 *
 * A `set`/`set-split-amount` formula may reference the running balance of an
 * account via BALANCE_OF("<account id or name>"). Because the formula evaluator
 * is synchronous but the balance needs a DB query, the referenced balances are
 * prefetched (see prepare.ts) into a `_balanceOfPrefetched` map that the
 * BALANCE_OF function reads at eval time.
 */

/** Collect formula strings from serialized or live rule actions. */
export function collectFormulasFromActions(
  actions: Array<{ options?: { formula?: unknown } | Record<string, unknown> }>,
): string[] {
  const out: string[] = [];
  for (const action of actions) {
    const f = (action.options as { formula?: unknown } | undefined)?.formula;
    if (typeof f === "string") out.push(f);
  }
  return out;
}

/** Decode escape sequences inside a double-quoted formula string literal. */
export function decodeBalanceOfQuotedLiteral(inner: string): string {
  return inner.replace(/\\"/g, '"').replace(/\\\\/g, "\\");
}

/** Distinct decoded string literals from BALANCE_OF("…") calls in a formula. */
export function extractBalanceOfLiterals(formula: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const re = /BALANCE_OF\s*\(\s*"((?:[^"\\]|\\.)*)"\s*\)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(formula)) !== null) {
    const decoded = decodeBalanceOfQuotedLiteral(m[1]);
    if (!seen.has(decoded)) {
      seen.add(decoded);
      out.push(decoded);
    }
  }
  return out;
}

/** Resolve an account id: exact id match first, else first exact name match. */
export function resolveAccountIdForBalanceOf(
  literal: string,
  accountsMap: Map<string, { id: string; name: string }>,
): string | null {
  if (accountsMap.has(literal)) return literal;
  for (const acc of accountsMap.values()) {
    if (acc.name === literal) return acc.id;
  }
  return null;
}
