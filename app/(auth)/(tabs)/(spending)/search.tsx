import { useCallback, useEffect, useRef, useState } from "react";
import { useRefreshControl } from "@/presentation/hooks/useRefreshControl";
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  Pressable,
  RefreshControl,
  TextInput,
  View,
} from "react-native";
import * as Haptics from "expo-haptics";
import { LegendList } from "@legendapp/list";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";

import {
  deleteTransaction,
  duplicateTransaction,
  searchTransactions,
  toggleCleared,
  updateTransaction,
  type TransactionDisplay,
} from "@/transactions";
import { useUndoStore } from "@/stores/undoStore";
import type { SearchToken } from "@/transactions/types";
import { useAccounts } from "@/presentation/hooks/useAccounts";
import { useCategories } from "@/presentation/hooks/useCategories";
import { useTheme } from "@/presentation/providers/ThemeProvider";
import { EmptyState } from "@/presentation/components";
import { TransactionRow } from "@/presentation/components/account/TransactionRow";
import { DateSectionHeader } from "@/presentation/components/account/DateSectionHeader";
import { TokenSearchBar } from "@/presentation/components/transaction/TokenSearchBar";
import { SearchSuggestions } from "@/presentation/components/transaction/SearchSuggestions";
import { useTags } from "@/presentation/hooks/useTags";
import { usePayees } from "@/presentation/hooks/usePayees";
import { GlassButton } from "@/presentation/components/atoms/GlassButton";
import {
  useTransactionSelection,
  useTransactionBulkActions,
  useSelectModeHeader,
  useBulkCategoryPicker,
  useBulkAccountPicker,
} from "@/presentation/hooks/transactionList";
import { usePickerStore } from "@/stores/pickerStore";
import { useTabBarStore } from "@/stores/tabBarStore";
import { SelectModeToolbar } from "@/presentation/components/transaction/SelectModeToolbar";

// ---------------------------------------------------------------------------
// Types for mixed list data
// ---------------------------------------------------------------------------

type DateHeader = { type: "date"; date: number; key: string };
type TransactionItem = {
  type: "transaction";
  data: TransactionDisplay;
  key: string;
  isFirst: boolean;
  isLast: boolean;
};
type ListItem = DateHeader | TransactionItem;

function buildListData(transactions: TransactionDisplay[]): ListItem[] {
  const items: ListItem[] = [];
  let lastDate: number | null = null;

  for (let i = 0; i < transactions.length; i++) {
    const txn = transactions[i];
    const isNewDate = txn.date !== lastDate;
    if (isNewDate) {
      if (items.length > 0) {
        const prev = items[items.length - 1];
        if (prev.type === "transaction") prev.isLast = true;
      }
      items.push({ type: "date", date: txn.date, key: `date-${txn.date}` });
      lastDate = txn.date;
    }
    items.push({
      type: "transaction",
      data: txn,
      key: txn.id,
      isFirst: isNewDate,
      isLast: false,
    });
  }

  if (items.length > 0) {
    const last = items[items.length - 1];
    if (last.type === "transaction") last.isLast = true;
  }

  return items;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildSearchParams(tkns: SearchToken[]) {
  const params: Record<string, unknown> = {};
  const tagNames: string[] = [];
  for (const t of tkns) {
    if (t.type === "status") params[t.value] = true;
    if (t.type === "account") params.accountId = t.accountId;
    if (t.type === "category") params.categoryId = t.categoryId;
    if (t.type === "payee") params.payeeId = t.payeeId;
    if (t.type === "tag") tagNames.push(t.tagName);
    if (t.type === "uncategorized") params.uncategorized = true;
  }
  if (tagNames.length > 0) params.tagNames = tagNames;
  return params;
}

const PAGE_SIZE = 25;

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function SearchScreen() {
  const navigation = useNavigation();
  const router = useRouter();
  const { initialFilter } = useLocalSearchParams<{ initialFilter?: string }>();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { accounts } = useAccounts();
  const { categories } = useCategories();
  const { tags } = useTags();
  const setTabBarHidden = useTabBarStore((s) => s.setHidden);
  const { payees } = usePayees();
  // Search state
  const searchInputRef = useRef<TextInput>(null);
  const [searchText, setSearchText] = useState("");
  const [searchFocused, setSearchFocused] = useState(!initialFilter);
  const [tokens, setTokens] = useState<SearchToken[]>(() => {
    if (initialFilter === "uncategorized") {
      return [{ type: "uncategorized" }];
    }
    if (
      initialFilter === "uncleared" ||
      initialFilter === "cleared" ||
      initialFilter === "reconciled" ||
      initialFilter === "unreconciled"
    ) {
      return [{ type: "status", value: initialFilter }];
    }
    return [];
  });

  // Results
  const [results, setResults] = useState<TransactionDisplay[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const offsetRef = useRef(0);
  const refreshIdRef = useRef(0);

  // ---- Selection ----
  const {
    selectedIds,
    isSelectMode,
    allCleared,
    selectedTotal,
    handleLongPress,
    enterSelectMode,
    handleSelectAll,
    handleDoneSelection,
    resetSelection,
  } = useTransactionSelection({
    transactions: results,
    onEnterSelectMode: () => setTabBarHidden(true),
    onExitSelectMode: () => setTabBarHidden(false),
  });

  const { handleBulkDelete, handleBulkMove, handleBulkToggleCleared, handleBulkChangeCategory } =
    useTransactionBulkActions({
      selectedIds,
      transactions: results,
      setTransactions: setResults,
      refreshIdRef,
      resetSelection,
      loadAccounts: () => {},
      optimisticBulkMove: (prev, ids, targetAccountId, targetAccountName) =>
        prev.map((t) =>
          ids.has(t.id) ? { ...t, account: targetAccountId, accountName: targetAccountName } : t,
        ),
    });

  const { triggerCategoryPicker } = useBulkCategoryPicker(handleBulkChangeCategory);
  const { triggerAccountPicker } = useBulkAccountPicker(handleBulkMove);

  useSelectModeHeader({
    isSelectMode,
    selectedCount: selectedIds.size,
    selectedTotal,
    onSelectAll: handleSelectAll,
    onDoneSelection: handleDoneSelection,
  });

  // Auto-focus on mount (skip if we have an initial filter — we'll auto-search instead)
  useEffect(() => {
    if (initialFilter) {
      // Auto-execute search with the initial filter
      const params = buildSearchParams(tokens);
      searchTransactions({ ...params, limit: PAGE_SIZE, offset: 0 }).then((txns) => {
        setResults(txns);
        setHasSearched(true);
        setHasMore(txns.length === PAGE_SIZE);
        offsetRef.current = txns.length;
      });
    } else {
      setTimeout(() => searchInputRef.current?.focus(), 100);
    }
  }, []);

  const hasResults = hasSearched && results.length > 0;

  // ---- Header ----
  useEffect(() => {
    if (isSelectMode) return;
    navigation.setOptions({
      headerRight: undefined,
      unstable_headerRightItems: () => [
        {
          type: "button" as const,
          label: t("select"),
          disabled: !hasResults,
          onPress: enterSelectMode,
        },
      ],
    });
  }, [hasResults, isSelectMode]);

  // ---- Token management ----

  const STATUS_EXCLUSIONS: Record<string, string> = {
    cleared: "uncleared",
    uncleared: "cleared",
    reconciled: "unreconciled",
    unreconciled: "reconciled",
  };

  function handleAddToken(token: SearchToken) {
    setTokens((prev) => {
      const filtered = prev.filter((t) => {
        // Replace same-type account/category/payee (single-value filters)
        if (t.type === token.type && token.type === "account") return false;
        if (t.type === token.type && token.type === "category") return false;
        if (t.type === token.type && token.type === "payee") return false;
        // Tags: remove duplicate tag, but allow multiple different tags
        if (t.type === "tag" && token.type === "tag" && t.tagName === token.tagName) return false;
        // Uncategorized is mutually exclusive with category
        if (t.type === "uncategorized" && token.type === "category") return false;
        if (t.type === "category" && token.type === "uncategorized") return false;
        if (t.type === "uncategorized" && token.type === "uncategorized") return false;
        // Remove duplicate status
        if (t.type === "status" && token.type === "status" && t.value === token.value) return false;
        // Remove mutually exclusive status (cleared/uncleared, reconciled/unreconciled)
        if (
          t.type === "status" &&
          token.type === "status" &&
          STATUS_EXCLUSIONS[token.value] === t.value
        )
          return false;
        return true;
      });
      return [...filtered, token];
    });
    setSearchText("");
  }

  function handleRemoveToken(index: number) {
    const next = tokens.filter((_, i) => i !== index);
    setTokens(next);
    if (!hasSearched) return;
    if (next.length === 0 && !searchText) {
      setResults([]);
      setHasSearched(false);
    } else {
      // Re-execute search with remaining filters
      offsetRef.current = 0;
      searchTransactions({
        text: searchText || undefined,
        ...buildSearchParams(next),
        limit: PAGE_SIZE,
        offset: 0,
      }).then((txns) => {
        setResults(txns);
        setHasMore(txns.length === PAGE_SIZE);
        offsetRef.current = txns.length;
      });
    }
  }

  function handleClear() {
    setSearchText("");
    setTokens([]);
    setResults([]);
    setHasSearched(false);
  }

  // ---- Search execution ----

  const executeSearch = useCallback(async () => {
    Keyboard.dismiss();
    offsetRef.current = 0;
    const txns = await searchTransactions({
      text: searchText || undefined,
      ...buildSearchParams(tokens),
      limit: PAGE_SIZE,
      offset: 0,
    });
    setResults(txns);
    setHasSearched(true);
    setHasMore(txns.length === PAGE_SIZE);
    offsetRef.current = txns.length;
  }, [searchText, tokens]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || !hasSearched) return;
    setLoadingMore(true);
    try {
      const txns = await searchTransactions({
        text: searchText || undefined,
        ...buildSearchParams(tokens),
        limit: PAGE_SIZE,
        offset: offsetRef.current,
      });
      if (txns.length === 0) {
        setHasMore(false);
        return;
      }
      setResults((prev) => [...prev, ...txns]);
      setHasMore(txns.length === PAGE_SIZE);
      offsetRef.current += txns.length;
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, hasSearched, searchText, tokens]);

  const { refreshControlProps } = useRefreshControl({
    syncFirst: false,
    onRefresh: async () => {
      if (!hasSearched) return;
      offsetRef.current = 0;
      const txns = await searchTransactions({
        text: searchText || undefined,
        ...buildSearchParams(tokens),
        limit: PAGE_SIZE,
        offset: 0,
      });
      setResults(txns);
      setHasMore(txns.length === PAGE_SIZE);
      offsetRef.current = txns.length;
    },
  });

  // ---- Transaction handlers ----

  function handleEditTransaction(txnId: string) {
    router.push({ pathname: "/(auth)/transaction/new", params: { transactionId: txnId } });
  }

  function handleDelete(txnId: string) {
    Alert.alert(t("spending.deleteTransactionTitle"), t("spending.deleteTransactionConfirm"), [
      { text: t("cancel"), style: "cancel" },
      {
        text: t("delete"),
        style: "destructive",
        onPress: async () => {
          setResults((prev) => prev.filter((tx) => tx.id !== txnId));
          await deleteTransaction(txnId);
          useUndoStore.getState().showUndo(t("spending.transactionDeleted"));
        },
      },
    ]);
  }

  async function handleToggleCleared(txnId: string) {
    setResults((prev) => prev.map((t) => (t.id === txnId ? { ...t, cleared: !t.cleared } : t)));
    await toggleCleared(txnId);
  }

  async function handleDuplicate(txnId: string) {
    const original = results.find((t) => t.id === txnId);
    if (!original) return;
    const newId = await duplicateTransaction(txnId);
    if (newId) {
      const clone: TransactionDisplay = {
        ...original,
        id: newId,
        cleared: false,
        reconciled: false,
      };
      setResults((prev) => {
        const idx = prev.findIndex((t) => t.id === txnId);
        const next = [...prev];
        next.splice(idx + 1, 0, clone);
        return next;
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }

  // Single-item move via account picker
  const pendingMoveRef = useRef<string | null>(null);
  const selectedAccount = usePickerStore((s) => s.selectedAccount);
  const clearPicker = usePickerStore((s) => s.clear);

  useEffect(() => {
    if (selectedAccount && pendingMoveRef.current) {
      const txnId = pendingMoveRef.current;
      pendingMoveRef.current = null;
      const targetAccountId = selectedAccount.id;
      const targetName = selectedAccount.name;
      clearPicker();
      setResults((prev) =>
        prev.map((t) =>
          t.id === txnId ? { ...t, account: targetAccountId, accountName: targetName } : t,
        ),
      );
      updateTransaction(txnId, { account: targetAccountId });
    }
  }, [selectedAccount, clearPicker]);

  function handleMove(txnId: string) {
    pendingMoveRef.current = txnId;
    router.push({ pathname: "/(auth)/transaction/account-picker", params: { selectedId: "" } });
  }

  // Single-item categorize via category picker
  const pendingCategoryRef = useRef<string | null>(null);
  const selectedCategory = usePickerStore((s) => s.selectedCategory);

  useEffect(() => {
    if (selectedCategory && pendingCategoryRef.current) {
      const txnId = pendingCategoryRef.current;
      pendingCategoryRef.current = null;
      const categoryId = selectedCategory.id;
      clearPicker();
      setResults((prev) => prev.map((t) => (t.id === txnId ? { ...t, category: categoryId } : t)));
      updateTransaction(txnId, { category: categoryId });
    }
  }, [selectedCategory, clearPicker]);

  function handleSetCategory(txnId: string) {
    pendingCategoryRef.current = txnId;
    router.push({ pathname: "/(auth)/transaction/category-picker", params: { hideSplit: "1" } });
  }

  function handleAddTag(txnId: string) {
    router.push({
      pathname: "/(auth)/transaction/tags",
      params: { transactionId: txnId, mode: "direct" },
    });
  }

  // ---- Render ----

  const listData = hasSearched ? buildListData(results) : [];

  return (
    <>
      <View style={{ backgroundColor: colors.pageBackground }}>
        <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 12, gap: 8 }}>
          <View style={{ flex: 1 }}>
            <TokenSearchBar
              text={searchText}
              onChangeText={setSearchText}
              tokens={tokens}
              onRemoveToken={handleRemoveToken}
              onClear={handleClear}
              onFocusChange={setSearchFocused}
              onSubmit={executeSearch}
              inputRef={searchInputRef}
              noHorizontalMargin
            />
          </View>
          <GlassButton icon="close" onPress={() => router.back()} hitSlop={4} />
        </View>
        {searchFocused && (
          <SearchSuggestions
            text={searchText}
            tokens={tokens}
            accounts={accounts.filter((a) => !a.closed).map((a) => ({ id: a.id, name: a.name }))}
            categories={categories
              .filter((c) => !c.hidden && !c.is_income)
              .map((c) => ({ id: c.id, name: c.name }))}
            payees={payees.filter((p) => !p.transfer_acct).map((p) => ({ id: p.id, name: p.name }))}
            tags={tags}
            onSelect={handleAddToken}
          />
        )}
      </View>

      <LegendList
        data={listData}
        keyExtractor={(item) => item.key}
        getItemType={(item) => item.type}
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="automatic"
        renderItem={({ item }) => {
          if (item.type === "date") {
            return <DateSectionHeader date={item.date} />;
          }
          if (item.type !== "transaction") return null;
          return (
            <TransactionRow
              item={item.data}
              onPress={handleEditTransaction}
              onDelete={handleDelete}
              onToggleCleared={handleToggleCleared}
              onLongPress={handleLongPress}
              onDuplicate={handleDuplicate}
              onMove={handleMove}
              onSetCategory={handleSetCategory}
              onAddTag={handleAddTag}
              showAccountName
              tags={tags}
              isFirst={item.isFirst}
              isLast={item.isLast}
              isSelectMode={isSelectMode}
              isSelected={selectedIds.has(item.data.id)}
            />
          );
        }}
        ListFooterComponent={
          loadingMore ? (
            <ActivityIndicator color={colors.primary} style={{ paddingVertical: 20 }} />
          ) : null
        }
        ListEmptyComponent={
          hasSearched ? (
            <EmptyState
              icon="searchOutline"
              title={t("spending.noMatchingTransactions")}
              description={t("spending.tryDifferentSearch")}
            />
          ) : null
        }
        onEndReached={loadMore}
        onEndReachedThreshold={0.3}
        refreshControl={<RefreshControl {...refreshControlProps} />}
        contentContainerStyle={{ paddingBottom: 80, backgroundColor: colors.pageBackground }}
      />

      {isSelectMode && (
        <SelectModeToolbar
          allCleared={allCleared}
          selectedCount={selectedIds.size}
          onToggleCleared={handleBulkToggleCleared}
          onDelete={handleBulkDelete}
          onMove={triggerAccountPicker}
          onSetCategory={triggerCategoryPicker}
        />
      )}
    </>
  );
}
