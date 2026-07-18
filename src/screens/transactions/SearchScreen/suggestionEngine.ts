import type { StatusFilter } from "@/core/domain/transactions/types";
import { STATUS_EXCLUSIONS, type SearchToken } from "./searchTokens";

const ALL_STATUSES: StatusFilter[] = ["cleared", "uncleared", "reconciled", "unreconciled"];

/**
 * A named filter candidate. `nameLower` is precomputed once per data change so
 * the per-keystroke scan doesn't re-lowercase every candidate.
 */
export interface NameOption {
  id: string;
  name: string;
  nameLower: string;
}

/** A tag candidate; `tagLower` mirrors `NameOption.nameLower`. */
export interface TagOption {
  tag: string;
  tagLower: string;
}

export type Suggestion =
  | { kind: "text"; value: string }
  | { kind: "status"; value: StatusFilter }
  | { kind: "account"; id: string; name: string }
  | { kind: "category"; id: string; name: string }
  | { kind: "payee"; id: string; name: string }
  | { kind: "tag"; name: string }
  | { kind: "uncategorized" };

export interface BuildSuggestionsInput {
  text: string;
  tokens: SearchToken[];
  accounts: NameOption[];
  categories: NameOption[];
  payees: NameOption[];
  tags: TagOption[];
  /** Skip account suggestions (account-scoped search — the scope is fixed). */
  hideAccounts?: boolean;
  /** Resolves the localized status name so text matching works. */
  statusLabel: (s: StatusFilter) => string;
  /** Localized "Uncategorized" label, for text matching. */
  uncategorizedLabel: string;
  maxTotal?: number;
  maxPerKind?: number;
}

/**
 * Short, prioritized autocomplete list: an "anything contains" row first when
 * there's text, then a capped handful per filter kind (statuses,
 * uncategorized, accounts, categories, payees, tags), deduped against the
 * active tokens — never a scrolling list.
 */
export function buildSuggestions({
  text,
  tokens,
  accounts,
  categories,
  payees,
  tags,
  hideAccounts = false,
  statusLabel,
  uncategorizedLabel,
  maxTotal = 8,
  maxPerKind = 2,
}: BuildSuggestionsInput): Suggestion[] {
  const query = text.toLowerCase().trim();

  // Active token keys for dedup (statuses include their exclusive counterpart).
  const activeKeys = new Set<string>();
  for (const t of tokens) {
    if (t.type === "status") {
      activeKeys.add(`status:${t.value}`);
      activeKeys.add(`status:${STATUS_EXCLUSIONS[t.value]}`);
    } else if (t.type === "account") {
      activeKeys.add(`account:${t.accountId}`);
    } else if (t.type === "category") {
      activeKeys.add(`category:${t.categoryId}`);
    } else if (t.type === "payee") {
      activeKeys.add(`payee:${t.payeeId}`);
    } else if (t.type === "tag") {
      activeKeys.add(`tag:${t.tagName}`);
    } else if (t.type === "uncategorized") {
      activeKeys.add("uncategorized");
    }
  }

  const suggestions: Suggestion[] = [];
  if (query) suggestions.push({ kind: "text", value: text.trim() });

  const push = (kindCount: { n: number }, s: Suggestion, kindCap = maxPerKind): boolean => {
    if (suggestions.length >= maxTotal || kindCount.n >= kindCap) return false;
    suggestions.push(s);
    kindCount.n++;
    return true;
  };

  // Statuses are exempt from the per-kind cap: there are only four and the
  // exclusion pairs (cleared↔uncleared, reconciled↔unreconciled) must all be
  // reachable without typing.
  const statusCount = { n: 0 };
  for (const s of ALL_STATUSES) {
    if (activeKeys.has(`status:${s}`)) continue;
    if (query && !statusLabel(s).toLowerCase().includes(query)) continue;
    if (!push(statusCount, { kind: "status", value: s }, ALL_STATUSES.length)) break;
  }

  // Uncategorized takes its own single slot.
  if (!activeKeys.has("uncategorized") && suggestions.length < maxTotal) {
    if (!query || uncategorizedLabel.toLowerCase().includes(query)) {
      suggestions.push({ kind: "uncategorized" });
    }
  }

  // Name-based suggestions (accounts / categories / payees / tags) only make
  // sense against typed text — with an empty query they're omitted entirely,
  // same as the "anything contains" row.
  if (query) {
    if (!hideAccounts) {
      const count = { n: 0 };
      for (const a of accounts) {
        if (activeKeys.has(`account:${a.id}`)) continue;
        if (!a.nameLower.includes(query)) continue;
        if (!push(count, { kind: "account", id: a.id, name: a.name })) break;
      }
    }

    const categoryCount = { n: 0 };
    for (const c of categories) {
      if (activeKeys.has(`category:${c.id}`)) continue;
      if (!c.nameLower.includes(query)) continue;
      if (!push(categoryCount, { kind: "category", id: c.id, name: c.name })) break;
    }

    const payeeCount = { n: 0 };
    for (const p of payees) {
      if (activeKeys.has(`payee:${p.id}`)) continue;
      if (!p.nameLower.includes(query)) continue;
      if (!push(payeeCount, { kind: "payee", id: p.id, name: p.name })) break;
    }

    const tagCount = { n: 0 };
    for (const t of tags) {
      if (activeKeys.has(`tag:${t.tag}`)) continue;
      if (!t.tagLower.includes(query)) continue;
      if (!push(tagCount, { kind: "tag", name: t.tag })) break;
    }
  }

  return suggestions.slice(0, maxTotal);
}

/** Turn a picked suggestion into the token it stands for. */
export function suggestionToToken(s: Suggestion): SearchToken {
  switch (s.kind) {
    case "text":
      return { type: "text", value: s.value };
    case "status":
      return { type: "status", value: s.value };
    case "account":
      return { type: "account", accountId: s.id, accountName: s.name };
    case "category":
      return { type: "category", categoryId: s.id, categoryName: s.name };
    case "payee":
      return { type: "payee", payeeId: s.id, payeeName: s.name };
    case "tag":
      return { type: "tag", tagName: s.name };
    case "uncategorized":
      return { type: "uncategorized" };
  }
}
