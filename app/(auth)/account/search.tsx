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

import {
  deleteTransaction,
  duplicateTransaction,
  searchTransactions,
  toggleCleared,
  updateTransaction,
  type TransactionDisplay,
} from "@core/transactions";
import { useUndoStore } from "@/stores/undoStore";
import { useAccounts } from "@/presentation/hooks/useAccounts";
import type { SearchToken } from "@core/transactions/types";
import { useCategories } from "@/presentation/hooks/useCategories";
import { useTheme } from "@/presentation/providers/ThemeProvider";
import { EmptyState } from "@/presentation/components";
import { TransactionRow } from "@/presentation/components/account/TransactionRow";
import { DateSectionHeader } from "@/presentation/components/account/DateSectionHeader";
import { TokenSearchBar } from "@/presentation/components/transaction/TokenSearchBar";
import { SearchSuggestions } from "@/presentation/components/transaction/SearchSuggestions";
import { useTags } from "@/presentation/hooks/useTags";
import { GlassButton } from "@/presentation/components/atoms/GlassButton";
import { useSelectModeHeader } from "@/presentation/hooks/transactionList";
import { useSelectionMode } from "@/presentation/hooks/useSelectionMode";
import { useTransactionBatchActions } from "@/presentation/hooks/useTransactionBatchActions";
import { usePickerStore } from "@/stores/pickerStore";
import { SelectModeToolbar } from "@/presentation/components/transaction/SelectModeToolbar";
import { useTranslation } from "react-i18next";

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
  for (const t of tkns) {
    if (t.type === "status") params[t.value] = true;
    if (t.type === "category") params.categoryId = t.categoryId;
    if (t.type === "tag") params.tagName = t.tagName;
    if (t.type === "uncategorized") params.uncategorized = true;
  }
  return params;
}

const STATUS_EXCLUSIONS: Record<string, string> = {
  cleared: "uncleared",
  uncleared: "cleared",
  reconciled: "unreconciled",
  unreconciled: "reconciled",
};

const PAGE_SIZE = 25;

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function AccountSearchScreen() {
  const { accountId, accountName, initialFilter } = useLocalSearchParams<{
    accountId: string;
    accountName: string;
    initialFilter?: string;
  }>();
  const navigation = useNavigation();
  const router = useRouter();
  const { colors } = useTheme();
  const { t } = useTranslation("accounts");
  const { t: tc } = useTranslation("common");
  const { accounts } = useAccounts();
  const { categories } = useCategories();
  const { tags } = useTags();

  // Search state
  const searchInputRef = useRef<TextInput>(null);
  const [searchText, setSearchText] = useState("");
  const [searchFocused, setSearchFocused] = useState(!initialFilter);
  const [tokens, setTokens] = useState<SearchToken[]>(() => {
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

  // ---- Selection ----
  const selection = useSelectionMode<TransactionDisplay>();

  const selectedTransactions = results.filter((t) => selection.selectedIds.has(t.id));
  const allCleared = (() => {
    const nonReconciled = selectedTransactions.filter((t) => !t.reconciled);
    return nonReconciled.length > 0 && nonReconciled.every((t) => t.cleared);
  })();
  const selectedTotal = selectedTransactions.reduce((sum, t) => sum + (t.amount as number), 0);

  const batchActions = useTransactionBatchActions({
    selectedIds: selection.selectedIds,
    transactions: results,
    onDone: selection.exit,
  });

  const bulkMovePendingRef = useRef(false);
  const bulkCategoryPendingRef = useRef(false);

  function triggerAccountPicker() {
    bulkMovePendingRef.current = true;
    router.push({ pathname: "/(auth)/transaction/account-picker", params: { selectedId: "" } });
  }
  function triggerCategoryPicker() {
    bulkCategoryPendingRef.current = true;
    router.push({ pathname: "/(auth)/transaction/category-picker", params: { hideSplit: "1" } });
  }

  useSelectModeHeader({
    isSelectMode: selection.isSelectMode,
    selectedCount: selection.selectedIds.size,
    selectedTotal,
    onDoneSelection: selection.exit,
  });

  // Auto-focus on mount (skip if initial filter — auto-search instead)
  useEffect(() => {
    if (initialFilter) {
      const params = buildSearchParams(
        tokens.length > 0 ? tokens : [{ type: "status", value: initialFilter as any }],
      );
      searchTransactions({ accountId, ...params, limit: PAGE_SIZE, offset: 0 }).then((txns) => {
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
    if (selection.isSelectMode) return;
    navigation.setOptions({
      title: accountName || t("detail.defaultTitle"),
      headerRight: undefined,
      unstable_headerRightItems: () => [
        {
          type: "button" as const,
          label: t("detail.select"),
          disabled: !hasResults,
          onPress: selection.enter,
        },
      ],
    });
  }, [hasResults, accountName, selection.isSelectMode]);

  // ---- Token management ----

  function handleAddToken(token: SearchToken) {
    setTokens((prev) => {
      const filtered = prev.filter((t) => {
        if (t.type === token.type && token.type === "category") return false;
        if (t.type === token.type && token.type === "tag") return false;
        if (t.type === "status" && token.type === "status" && t.value === token.value) return false;
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
        accountId,
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
      accountId,
      ...buildSearchParams(tokens),
      limit: PAGE_SIZE,
      offset: 0,
    });
    setResults(txns);
    setHasSearched(true);
    setHasMore(txns.length === PAGE_SIZE);
    offsetRef.current = txns.length;
  }, [searchText, tokens, accountId]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || !hasSearched) return;
    setLoadingMore(true);
    try {
      const txns = await searchTransactions({
        text: searchText || undefined,
        accountId,
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
  }, [loadingMore, hasMore, hasSearched, searchText, tokens, accountId]);

  const { refreshControlProps } = useRefreshControl({
    syncFirst: false,
    onRefresh: async () => {
      if (!hasSearched) return;
      offsetRef.current = 0;
      const txns = await searchTransactions({
        text: searchText || undefined,
        accountId,
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
    Alert.alert(t("search.deleteTransactionTitle"), t("search.deleteTransactionMessage"), [
      { text: tc("cancel"), style: "cancel" },
      {
        text: tc("delete"),
        style: "destructive",
        onPress: async () => {
          setResults((prev) => prev.filter((tx) => tx.id !== txnId));
          await deleteTransaction(txnId);
          useUndoStore.getState().showUndo(t("search.transactionDeleted"));
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
    if (!selectedAccount) return;
    if (pendingMoveRef.current) {
      const txnId = pendingMoveRef.current;
      pendingMoveRef.current = null;
      clearPicker();
      setResults((prev) => prev.filter((t) => t.id !== txnId));
      updateTransaction(txnId, { account: selectedAccount.id });
    } else if (bulkMovePendingRef.current) {
      bulkMovePendingRef.current = false;
      batchActions.handleBulkMove(selectedAccount.id, selectedAccount.name);
      clearPicker();
    }
  }, [selectedAccount, clearPicker, batchActions.handleBulkMove]);

  function handleMove(txnId: string) {
    pendingMoveRef.current = txnId;
    router.push({ pathname: "/(auth)/transaction/account-picker", params: { selectedId: "" } });
  }

  // Single-item categorize via category picker
  const pendingCategoryRef = useRef<string | null>(null);
  const selectedCategory = usePickerStore((s) => s.selectedCategory);

  useEffect(() => {
    if (!selectedCategory) return;
    if (pendingCategoryRef.current) {
      const txnId = pendingCategoryRef.current;
      pendingCategoryRef.current = null;
      clearPicker();
      if (selectedCategory.id) {
        setResults((prev) =>
          prev.map((t) => (t.id === txnId ? { ...t, category: selectedCategory.id } : t)),
        );
        updateTransaction(txnId, { category: selectedCategory.id });
      }
    } else if (bulkCategoryPendingRef.current) {
      bulkCategoryPendingRef.current = false;
      if (selectedCategory.id) batchActions.handleBulkChangeCategory(selectedCategory.id);
      clearPicker();
    }
  }, [selectedCategory, clearPicker, batchActions.handleBulkChangeCategory]);

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
      <View style={{ flex: 1, backgroundColor: colors.pageBackground }}>
        <View style={{ backgroundColor: colors.pageBackground }}>
          <View
            style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 12, gap: 8 }}
          >
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
              accounts={[]}
              categories={categories
                .filter((c) => !c.hidden && !c.is_income)
                .map((c) => ({ id: c.id, name: c.name }))}
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
                onLongPress={(txnId: string) => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  selection.longPress(txnId);
                }}
                onDuplicate={handleDuplicate}
                onMove={handleMove}
                onSetCategory={handleSetCategory}
                onAddTag={handleAddTag}
                tags={tags}
                isFirst={item.isFirst}
                isLast={item.isLast}
                isSelectMode={selection.isSelectMode}
                isSelected={selection.selectedIds.has(item.data.id)}
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
                title={t("search.noResults.title")}
                description={t("search.noResults.description")}
              />
            ) : null
          }
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          refreshControl={<RefreshControl {...refreshControlProps} />}
          contentContainerStyle={{ paddingBottom: 80, backgroundColor: colors.pageBackground }}
        />
      </View>

      {selection.isSelectMode && (
        <SelectModeToolbar
          allCleared={allCleared}
          selectedCount={selection.selectedIds.size}
          onToggleCleared={batchActions.handleBulkToggleCleared}
          onDelete={batchActions.handleBulkDelete}
          onMove={triggerAccountPicker}
          onSetCategory={triggerCategoryPicker}
        />
      )}
    </>
  );
}
