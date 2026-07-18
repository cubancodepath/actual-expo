import { q, type Query } from "@/core/queries";
import type { ObjectExpression } from "@/core/queries";
import type { SearchToken } from "./searchTokens";

/**
 * The active search: every filter — including the free text — is a token. The
 * screen derives these params live from the tokens (plus the fixed account
 * scope when opened from one account's ledger); no tokens means `null`
 * upstream and the query stays idle.
 */
export interface SearchParams {
  text?: string;
  accountId?: string;
  categoryId?: string;
  payeeId?: string;
  cleared?: boolean;
  uncleared?: boolean;
  reconciled?: boolean;
  unreconciled?: boolean;
  uncategorized?: boolean;
  tagNames?: string[];
}

/** Map the active tokens (+ the fixed account scope) to `searchTransactions` opts. */
export function buildSearchParams(tokens: SearchToken[], accountId?: string): SearchParams {
  const params: SearchParams = {};
  if (accountId) params.accountId = accountId;
  const tagNames: string[] = [];
  for (const t of tokens) {
    if (t.type === "text") params.text = t.value;
    if (t.type === "status") params[t.value] = true;
    if (t.type === "account" && !accountId) params.accountId = t.accountId;
    if (t.type === "category") params.categoryId = t.categoryId;
    if (t.type === "payee") params.payeeId = t.payeeId;
    if (t.type === "tag") tagNames.push(t.tagName);
    if (t.type === "uncategorized") params.uncategorized = true;
  }
  if (tagNames.length > 0) params.tagNames = tagNames;
  return params;
}

/**
 * Compile the active search params into an AQL transactions query. Mirrors the
 * ledger's `buildTransactionsListQuery` — a single query path (no hand-written
 * SQL builder). Pure + exported so it can be unit-tested against the compiler.
 */
export function buildSearchQuery(params: SearchParams): Query {
  const filters: ObjectExpression[] = [];

  if (params.accountId) filters.push({ acct: params.accountId });
  if (params.categoryId) filters.push({ category: params.categoryId });
  if (params.payeeId) filters.push({ payee: params.payeeId });

  // Status filters, OR'd together (matching the old builder's withStatus).
  const statusClauses: ObjectExpression[] = [];
  if (params.cleared) statusClauses.push({ cleared: true, reconciled: false });
  if (params.uncleared) statusClauses.push({ cleared: false });
  if (params.reconciled) statusClauses.push({ reconciled: true });
  if (params.unreconciled) statusClauses.push({ reconciled: false });
  if (statusClauses.length > 0) filters.push({ $or: statusClauses });

  // Each tag is an AND'd notes LIKE.
  for (const tag of params.tagNames ?? []) {
    filters.push({ notes: { $like: `%#${tag}%` } });
  }

  if (params.uncategorized) {
    // Uncategorized on-budget rows, excluding transfers between on-budget
    // accounts (auto-categorized) but keeping transfers to off-budget accounts.
    filters.push({ category: null });
    filters.push({ $or: [{ isTransfer: false }, { transferAccountOffbudget: true }] });
  }

  if (params.text) {
    const like = { $like: `%${params.text}%` };
    filters.push({
      $or: [{ payeeName: like }, { categoryName: like }, { notes: like }, { accountName: like }],
    });
  }

  let query = q("transactions");
  for (const f of filters) query = query.filter(f);
  return query.select(["*", "accountName"]);
}
