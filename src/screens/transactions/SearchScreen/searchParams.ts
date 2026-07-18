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
