import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TextInput } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useAccounts } from "@/lib/hooks/useAccounts";
import { useCategories } from "@/lib/hooks/useCategories";
import { usePayees } from "@/lib/hooks/usePayees";
import { useTags } from "@/screens/transactions/hooks/useTags";
import { buildTxListItems } from "@/screens/transactions/components/transaction-list/listItems";
import type { TransactionDisplay } from "@/core/types/models";
import { addToken, initialTokensFromFilter, tokenKey, STATUS_LABEL_KEYS } from "../searchTokens";
import type { SearchToken } from "../searchTokens";
import { buildSearchParams } from "../searchParams";
import { buildSuggestions } from "../suggestionEngine";
import { useTransactionSearch } from "./useTransactionSearch";

interface UseSearchControllerArgs {
  /** Fixed account scope when opened from one account's ledger. */
  accountId?: string;
  initialFilter?: string;
}

/**
 * Owns the whole search state machine — the token filters, the search text and
 * focus, and everything derived from them (query params, paged results, list
 * items, the autocomplete suggestions) plus the handlers that mutate them. The
 * screen consumes this and does nothing but render; the pure token/params/
 * suggestion logic lives in the sibling `searchTokens`/`searchParams`/
 * `suggestionEngine` modules.
 */
export function useSearchController({ accountId, initialFilter }: UseSearchControllerArgs) {
  const router = useRouter();
  const { t } = useTranslation("transactions");
  const { accounts } = useAccounts();
  const { categories } = useCategories();
  const { payees } = usePayees();
  const { tags } = useTags();

  const searchInputRef = useRef<TextInput>(null);
  const [searchText, setSearchText] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [tokens, setTokens] = useState<SearchToken[]>(() => initialTokensFromFilter(initialFilter));

  // Auto-focus on mount, unless an initial filter already runs a search.
  useEffect(() => {
    if (!initialFilter) {
      const timer = setTimeout(() => searchInputRef.current?.focus(), 100);
      return () => clearTimeout(timer);
    }
  }, [initialFilter]);

  // Picking a filter closes the autocomplete. Drop `searchFocused` in the same
  // synchronous batch as clearing the text — relying on the async `onBlur`
  // instead leaves one frame where the curtain is still shown but the text is
  // already empty, so it repaints with the no-text suggestion list right
  // before the exit animation (the visible "double render"). `blur()` still
  // dismisses the keyboard.
  const addFilterToken = useCallback((token: SearchToken) => {
    setTokens((prev) => addToken(prev, token));
    setSearchText("");
    setSearchFocused(false);
    searchInputRef.current?.blur();
  }, []);

  const submitText = useCallback(() => {
    const value = searchText.trim();
    if (value) addFilterToken({ type: "text", value });
  }, [searchText, addFilterToken]);

  // Removing the last filter puts the screen back in "start a search" mode:
  // refocus the input so the suggestions come right back.
  const removeTokensByKey = useCallback(
    (keys: Set<string | number>) => {
      const next = tokens.filter((token) => !keys.has(tokenKey(token)));
      setTokens(next);
      if (next.length === 0) searchInputRef.current?.focus();
    },
    [tokens],
  );

  const removeLastTokenOnBackspace = useCallback(
    (e: { nativeEvent: { key: string } }) => {
      if (e.nativeEvent.key === "Backspace" && searchText === "") {
        setTokens((prev) => prev.slice(0, -1));
      }
    },
    [searchText],
  );

  // Live search: the params derive straight from the tokens.
  const params = useMemo(
    () => (tokens.length > 0 ? buildSearchParams(tokens, accountId) : null),
    [tokens, accountId],
  );

  const placeholderKey: "search.refine" | "search.placeholder" =
    tokens.length > 0 ? "search.refine" : "search.placeholder";

  const { transactions, fetchNextPage, hasNextPage, isFetchingNextPage, isPending } =
    useTransactionSearch(params);

  // In the account-scoped search every row is from the same account — drop the
  // name so rows don't repeat what the scope already says.
  const items = useMemo(() => {
    if (params === null) return [];
    const display = accountId
      ? transactions.map((txn) => ({ ...txn, accountName: null }))
      : transactions;
    return buildTxListItems(display);
  }, [params, transactions, accountId]);

  // Preprocess each source list once per data change (filter, project, and
  // precompute the lowercased name) so the per-keystroke suggestion scan only
  // does the substring match, not O(n) filtering/allocation every key.
  const accountOptions = useMemo(
    () =>
      accounts
        .filter((a) => !a.closed)
        .map((a) => ({ id: a.id, name: a.name, nameLower: a.name.toLowerCase() })),
    [accounts],
  );
  const categoryOptions = useMemo(
    () =>
      categories
        .filter((c) => !c.hidden && !c.is_income)
        .map((c) => ({ id: c.id, name: c.name, nameLower: c.name.toLowerCase() })),
    [categories],
  );
  const payeeOptions = useMemo(
    () =>
      payees
        .filter((p) => !p.transfer_acct)
        .map((p) => ({ id: p.id, name: p.name, nameLower: p.name.toLowerCase() })),
    [payees],
  );
  const tagOptions = useMemo(
    () => tags.map((tg) => ({ tag: tg.tag, tagLower: tg.tag.toLowerCase() })),
    [tags],
  );

  const suggestions = useMemo(
    () =>
      buildSuggestions({
        text: searchText,
        tokens,
        hideAccounts: !!accountId,
        accounts: accountOptions,
        categories: categoryOptions,
        payees: payeeOptions,
        tags: tagOptions,
        statusLabel: (s) => t(STATUS_LABEL_KEYS[s]),
        uncategorizedLabel: t("uncategorized"),
      }),
    [searchText, tokens, accountId, accountOptions, categoryOptions, payeeOptions, tagOptions, t],
  );

  // Stable so the memoized `TransactionRow` doesn't re-render on every keystroke.
  const onPressRow = useCallback(
    (txn: TransactionDisplay) => {
      router.push({ pathname: "/(auth)/transaction/new", params: { transactionId: txn.id } });
    },
    [router],
  );

  const close = useCallback(() => router.back(), [router]);

  return {
    // search bar
    searchInputRef,
    searchText,
    setSearchText,
    searchFocused,
    setSearchFocused,
    placeholderKey,
    onSubmitText: submitText,
    onBackspace: removeLastTokenOnBackspace,
    // tokens + suggestions
    tokens,
    suggestions,
    addFilterToken,
    removeTokensByKey,
    // results
    items,
    isPending,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    hasSearched: params !== null,
    // navigation
    onPressRow,
    close,
  };
}
