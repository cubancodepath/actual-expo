import type { StatusFilter } from "@/core/types/models";

/**
 * A search filter. Every filter — including the free text — is a token; the
 * screen tokenizes the search bar and derives the query params from these.
 * UI vocabulary of the search screen (the query engine takes a flat opts
 * object), so it lives here, not in `core/server`.
 */
export type SearchToken =
  | { type: "text"; value: string }
  | { type: "status"; value: StatusFilter }
  | { type: "account"; accountId: string; accountName: string }
  | { type: "category"; categoryId: string; categoryName: string }
  | { type: "payee"; payeeId: string; payeeName: string }
  | { type: "tag"; tagName: string }
  | { type: "uncategorized" };

/** i18n keys (namespace "transactions") for each status filter's label. */
export const STATUS_LABEL_KEYS = {
  cleared: "statusCleared",
  uncleared: "statusUncleared",
  reconciled: "statusReconciled",
  unreconciled: "statusUnreconciled",
} as const satisfies Record<StatusFilter, string>;

/** Mutually exclusive status pairs (cleared↔uncleared, reconciled↔unreconciled). */
export const STATUS_EXCLUSIONS: Record<StatusFilter, StatusFilter> = {
  cleared: "uncleared",
  uncleared: "cleared",
  reconciled: "unreconciled",
  unreconciled: "reconciled",
};

/** Stable id for a token, used as the TagGroup item key. */
export function tokenKey(token: SearchToken): string {
  switch (token.type) {
    case "text":
      return `text:${token.value}`;
    case "status":
      return `status:${token.value}`;
    case "account":
      return `account:${token.accountId}`;
    case "category":
      return `category:${token.categoryId}`;
    case "payee":
      return `payee:${token.payeeId}`;
    case "tag":
      return `tag:${token.tagName}`;
    case "uncategorized":
      return "uncategorized";
  }
}

/**
 * Add a token, dropping the ones it replaces: single-value filters
 * (text/account/category/payee) replace their kind, duplicate tags/statuses
 * collapse, mutually exclusive statuses (cleared↔uncleared,
 * reconciled↔unreconciled) and uncategorized↔category displace each other.
 */
export function addToken(tokens: SearchToken[], token: SearchToken): SearchToken[] {
  const filtered = tokens.filter((t) => {
    if (t.type === token.type && token.type === "text") return false;
    if (t.type === token.type && token.type === "account") return false;
    if (t.type === token.type && token.type === "category") return false;
    if (t.type === token.type && token.type === "payee") return false;
    if (t.type === "tag" && token.type === "tag" && t.tagName === token.tagName) return false;
    if (t.type === "uncategorized" && token.type === "category") return false;
    if (t.type === "category" && token.type === "uncategorized") return false;
    if (t.type === "uncategorized" && token.type === "uncategorized") return false;
    if (t.type === "status" && token.type === "status" && t.value === token.value) return false;
    if (
      t.type === "status" &&
      token.type === "status" &&
      STATUS_EXCLUSIONS[token.value] === t.value
    ) {
      return false;
    }
    return true;
  });
  return [...filtered, token];
}

/** Tokens the screen opens with, from the `initialFilter` route param. */
export function initialTokensFromFilter(initialFilter?: string): SearchToken[] {
  if (initialFilter === "uncategorized") return [{ type: "uncategorized" }];
  if (
    initialFilter === "uncleared" ||
    initialFilter === "cleared" ||
    initialFilter === "reconciled" ||
    initialFilter === "unreconciled"
  ) {
    return [{ type: "status", value: initialFilter }];
  }
  return [];
}
