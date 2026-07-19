/**
 * Transaction enrichment for rules — prepare and finalize.
 * Ported from loot-core/src/server/transactions/transaction-rules.ts
 *
 * prepareTransactionForRules() adds context (payee name, account object,
 * category name, balance) that rule conditions may need.
 *
 * finalizeTransactionForRules() cleans up temp fields and creates
 * new payees when rules set payee_name.
 */

import { first, runQuery } from "@/core/db";
import { findOrCreatePayee } from "../payees";
import {
  collectFormulasFromActions,
  extractBalanceOfLiterals,
  resolveAccountIdForBalanceOf,
} from "./balanceOfFormula";

// ── Types ──

type AccountRow = {
  id: string;
  name: string;
  offbudget: 0 | 1;
  closed: 0 | 1;
};

export type EnrichedTransaction = Record<string, unknown> & {
  payee_name?: string | null;
  _account?: AccountRow | null;
  _account_name?: string;
  _category_name?: string;
  balance?: number;
};

// ── Accounts lookup ──

/**
 * Fresh account map for rule enrichment. Deliberately not cached: the previous
 * module-level cache was never invalidated on account mutations, so rules saw
 * stale account data (onBudget/offBudget conditions, BALANCE_OF). The accounts
 * table is tiny and rules run on save/post (not in tight loops).
 */
async function getAccountMap(): Promise<Map<string, AccountRow>> {
  const rows = await runQuery<AccountRow>(
    "SELECT id, name, offbudget, closed FROM accounts WHERE tombstone = 0",
  );
  return new Map(rows.map((r) => [r.id, r]));
}

/** Retained as a no-op for API compatibility; the map is no longer cached. */
export function invalidateAccountCache(): void {}

// ── Prepare ──

/**
 * Enrich a transaction object with contextual data needed by rule conditions:
 * - payee_name: display name of the payee
 * - _account: full account row (for onBudget/offBudget conditions)
 * - _account_name: account display name
 * - _category_name: category display name
 * - balance: running account balance up to this transaction (expensive, optional)
 *
 * The input should use public rule field names (payee, account, category, etc.)
 */
export async function prepareTransactionForRules(
  txn: Record<string, unknown>,
  opts?: { skipBalance?: boolean },
): Promise<EnrichedTransaction> {
  const enriched: EnrichedTransaction = { ...txn };
  const accounts = await getAccountMap();

  // Payee name
  if (enriched.payee && typeof enriched.payee === "string" && enriched.payee !== "new") {
    const payeeRow = await first<{ name: string }>(
      "SELECT name FROM payees WHERE id = ? AND tombstone = 0",
      [enriched.payee],
    );
    enriched.payee_name = payeeRow?.name ?? null;
  }

  // Account object + name
  if (enriched.account && typeof enriched.account === "string") {
    const acct = accounts.get(enriched.account);
    if (acct) {
      enriched._account = acct;
      enriched._account_name = acct.name;
    }
  }

  // Category name
  if (enriched.category && typeof enriched.category === "string") {
    const catRow = await first<{ name: string }>(
      "SELECT name FROM categories WHERE id = ? AND tombstone = 0",
      [enriched.category],
    );
    enriched._category_name = catRow?.name ?? "";
  }

  // Balance — expensive query, skip for form-level rule application
  if (!opts?.skipBalance && enriched.account && enriched.date) {
    const balanceRow = await first<{ total: number }>(
      `SELECT COALESCE(SUM(amount), 0) as total FROM transactions
       WHERE acct = ? AND tombstone = 0 AND isChild = 0
       AND (date < ? OR (date = ? AND sort_order <= COALESCE(?, 0)))`,
      [
        enriched.account as string,
        toDateInt(enriched.date),
        toDateInt(enriched.date),
        (enriched.sort_order as number) ?? 0,
      ],
    );
    enriched.balance = balanceRow?.total ?? 0;
  }

  return enriched;
}

// ── BALANCE_OF prefetch ──

/** Normalize a date (ISO "YYYY-MM-DD" or already-int YYYYMMDD) to integer form. */
function toDateInt(date: unknown): number {
  if (typeof date === "number") return date;
  if (typeof date === "string") return Number(date.replace(/-/g, "")) || 0;
  return 0;
}

/**
 * Running balance of `accountId` strictly before (`date`, `sortOrder`),
 * excluding `excludeId`, over non-child rows. Used to resolve BALANCE_OF("…")
 * literals synchronously during formula evaluation.
 */
async function getRunningBalanceBefore(
  accountId: string,
  date: unknown,
  sortOrder: unknown,
  excludeId: unknown,
): Promise<number> {
  const dateInt = toDateInt(date);
  const row = await first<{ total: number }>(
    `SELECT COALESCE(SUM(amount), 0) as total FROM transactions
     WHERE acct = ? AND tombstone = 0 AND isChild = 0
     AND id != ?
     AND (date < ? OR (date = ? AND COALESCE(sort_order, 0) < COALESCE(?, 0)))`,
    [accountId, (excludeId as string) ?? "", dateInt, dateInt, (sortOrder as number) ?? 0],
  );
  return row?.total ?? 0;
}

/**
 * Prefetch the running balances referenced by BALANCE_OF("…") literals across
 * the given rules' action formulas, so the synchronous evaluator can read them.
 * Returns an empty map (no queries) when no formula references BALANCE_OF.
 */
export async function prefetchBalanceOf(
  rules: Array<{ actions: Array<{ options?: Record<string, unknown> }> }>,
  txn: Record<string, unknown>,
): Promise<Map<string, number>> {
  const literals = new Set<string>();
  for (const rule of rules) {
    for (const formula of collectFormulasFromActions(rule.actions)) {
      for (const lit of extractBalanceOfLiterals(formula)) literals.add(lit);
    }
  }

  const map = new Map<string, number>();
  if (literals.size === 0) return map;

  const accounts = await getAccountMap();
  for (const literal of literals) {
    const accountId = resolveAccountIdForBalanceOf(literal, accounts);
    map.set(
      literal,
      accountId ? await getRunningBalanceBefore(accountId, txn.date, txn.sort_order, txn.id) : 0,
    );
  }
  return map;
}

// ── Finalize ──

/**
 * Clean up a rule-processed transaction:
 * - If payee === 'new', create or find the payee by payee_name
 * - Remove temporary enrichment fields
 */
export async function finalizeTransactionForRules(
  txn: EnrichedTransaction,
): Promise<Record<string, unknown>> {
  // Create new payee if rules set payee_name
  if (txn.payee === "new") {
    if (txn.payee_name && typeof txn.payee_name === "string") {
      const payeeId = await findOrCreatePayee(txn.payee_name);
      txn.payee = payeeId;
    } else {
      txn.payee = null;
    }
  }

  // Remove temporary fields
  delete txn.payee_name;
  delete txn._account;
  delete txn._account_name;
  delete txn._category_name;
  delete txn.balance;
  delete (txn as Record<string, unknown>).parent_amount;
  delete (txn as Record<string, unknown>)._balanceOfPrefetched;

  return txn;
}
