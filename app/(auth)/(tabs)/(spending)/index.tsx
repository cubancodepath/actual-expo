import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useSharedValue } from "react-native-reanimated";
import { ActivityIndicator, Alert, LayoutAnimation, RefreshControl } from "react-native";
import { LegendList } from "@legendapp/list";
import { Stack, useFocusEffect, useNavigation, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import * as Haptics from "expo-haptics";
import {
  deleteTransaction,
  duplicateTransaction,
  toggleCleared,
  updateTransaction,
} from "@/transactions";
import { usePrivacyStore } from "@/stores/privacyStore";
import { useUndoStore } from "@/stores/undoStore";
import { useCommonMenuActions } from "@/presentation/hooks/useCommonMenuItems";
import { useTabBarStore } from "@/stores/tabBarStore";
import { useTheme } from "@/presentation/providers/ThemeProvider";
import { EmptyState } from "@/presentation/components";
import { UnclearedPill } from "@/presentation/components/transaction/UnclearedPill";
import { TransactionRow } from "@/presentation/components/account/TransactionRow";
import { DateSectionHeader } from "@/presentation/components/account/DateSectionHeader";
import { UpcomingSectionHeader } from "@/presentation/components/account/UpcomingSectionHeader";
import { UpcomingScheduleRow } from "@/presentation/components/account/UpcomingScheduleRow";
import { AddTransactionButton } from "@/presentation/components/molecules/AddTransactionButton";
import { useTags } from "@/presentation/hooks/useTags";
import { usePickerStore } from "@/stores/pickerStore";
import {
  buildListData,
  useSelectModeHeader,
  type ListItem,
} from "@/presentation/hooks/transactionList";
import { SelectModeToolbar } from "@/presentation/components/transaction/SelectModeToolbar";
import {
  skipNextDate,
  postTransactionForSchedule,
  postTransactionForScheduleToday,
  deleteSchedule,
  updateSchedule,
} from "@/schedules";
import { useTransactions } from "@/presentation/hooks/useTransactions";
import { q } from "@/queries";
import { useSelectionMode } from "@/presentation/hooks/useSelectionMode";
import { usePreviewTransactions } from "@/presentation/hooks/usePreviewTransactions";
import { useLiveQuery } from "@/presentation/hooks/useQuery";
import { useTransactionBatchActions } from "@/presentation/hooks/useTransactionBatchActions";
import type { TransactionDisplay } from "@/transactions/types";

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function SpendingScreen() {
  const navigation = useNavigation();
  const router = useRouter();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { t: tt } = useTranslation("transactions");
  usePrivacyStore(); // subscribe to re-render on privacy mode change
  const setTabBarHidden = useTabBarStore((s) => s.setHidden);
  const { tags } = useTags();

  // ---- Upcoming scheduled transactions (reactive, derived from liveQuery) ----
  const [upcomingExpanded, setUpcomingExpanded] = useState(false);
  const previewTransactions = usePreviewTransactions();

  // ---- Transaction data (AQL + React Query + sync-event auto-refresh) ----
  const txnQuery = useMemo(() => q("transactions").select(["*", "accountName"]), []);
  const { transactions, fetchNextPage, hasNextPage, isFetchingNextPage, refetch } = useTransactions(
    {
      query: txnQuery,
      options: { pageSize: 25 },
    },
  );

  // Uncleared count — reactive via liveQuery
  const unclearedQuery = useMemo(
    () =>
      q("transactions").filter({ cleared: false, reconciled: false }).calculate({ $count: "$id" }),
    [],
  );
  const { data: unclearedData } = useLiveQuery<{ result: number }>(
    () => unclearedQuery,
    [unclearedQuery],
  );
  const unclearedCount = unclearedData?.[0]?.result ?? 0;

  // ---- Selection mode ----
  const selection = useSelectionMode<TransactionDisplay>();

  const selectedTransactions = useMemo(
    () => transactions.filter((txn) => selection.selectedIds.has(txn.id)),
    [transactions, selection.selectedIds],
  );
  const allCleared = useMemo(() => {
    const nonReconciled = selectedTransactions.filter((t) => !t.reconciled);
    return nonReconciled.length > 0 && nonReconciled.every((t) => t.cleared);
  }, [selectedTransactions]);
  const selectedTotal = useMemo(
    () => selectedTransactions.reduce((sum, t) => sum + (t.amount as number), 0),
    [selectedTransactions],
  );

  // ---- Bulk actions ----
  const batchActions = useTransactionBatchActions({
    selectedIds: selection.selectedIds,
    transactions: transactions as TransactionDisplay[],
    onDone: () => {
      selection.exit();
      setTabBarHidden(false);
    },
  });

  // ---- Select mode header ----
  useSelectModeHeader({
    isSelectMode: selection.isSelectMode,
    selectedCount: selection.selectedIds.size,
    selectedTotal,
    onDoneSelection: () => {
      selection.exit();
      setTabBarHidden(false);
    },
  });

  // ---- Scroll-driven FAB collapse ----
  const fabCollapsed = useSharedValue(false);
  const handleScroll = useCallback((e: { nativeEvent: { contentOffset: { y: number } } }) => {
    fabCollapsed.value = e.nativeEvent.contentOffset.y > 100;
  }, []);

  // Reset selection on blur (unless a bulk picker is pending)
  useFocusEffect(
    useCallback(() => {
      return () => {
        if (!bulkMovePendingRef.current && !bulkCategoryPendingRef.current) {
          selection.exit();
          setTabBarHidden(false);
        }
      };
    }, []),
  );

  // ---- Single-transaction actions ----

  function handleEditTransaction(txnId: string) {
    router.push({ pathname: "/(auth)/transaction/new", params: { transactionId: txnId } });
  }

  function handleDelete(txnId: string) {
    Alert.alert(tt("deleteTitle"), tt("deleteConfirm"), [
      { text: tt("cancel"), style: "cancel" },
      {
        text: tt("delete"),
        style: "destructive",
        onPress: async () => {
          await deleteTransaction(txnId);
          useUndoStore.getState().showUndo(tt("deleteTransaction"));
          // sync-event auto-refreshes
        },
      },
    ]);
  }

  function handleToggleCleared(txnId: string) {
    toggleCleared(txnId);
    // sync-event auto-refreshes
  }

  async function handleDuplicate(txnId: string) {
    await duplicateTransaction(txnId);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    // sync-event auto-refreshes
  }

  function handleAddTag(txnId: string) {
    router.push({
      pathname: "/(auth)/transaction/tags",
      params: { transactionId: txnId, mode: "direct" },
    });
  }

  // ---- Picker integration (single + bulk) ----
  const pendingMoveRef = useRef<string | null>(null);
  const pendingCategoryRef = useRef<string | null>(null);
  const bulkMovePendingRef = useRef(false);
  const bulkCategoryPendingRef = useRef(false);

  const selectedAccount = usePickerStore((s) => s.selectedAccount);
  const selectedCategory = usePickerStore((s) => s.selectedCategory);
  const clearPicker = usePickerStore((s) => s.clear);

  function handleMove(txnId: string) {
    pendingMoveRef.current = txnId;
    router.push({ pathname: "/(auth)/transaction/account-picker", params: { selectedId: "" } });
  }

  function handleSetCategory(txnId: string) {
    pendingCategoryRef.current = txnId;
    router.push({ pathname: "/(auth)/transaction/category-picker", params: { hideSplit: "1" } });
  }

  function triggerAccountPicker() {
    bulkMovePendingRef.current = true;
    router.push({ pathname: "/(auth)/transaction/account-picker", params: { selectedId: "" } });
  }

  function triggerCategoryPicker() {
    bulkCategoryPendingRef.current = true;
    router.push({ pathname: "/(auth)/transaction/category-picker", params: { hideSplit: "1" } });
  }

  // Apply picker results
  useEffect(() => {
    if (!selectedAccount) return;
    if (pendingMoveRef.current) {
      const txnId = pendingMoveRef.current;
      pendingMoveRef.current = null;
      updateTransaction(txnId, { account: selectedAccount.id });
      clearPicker();
    } else if (bulkMovePendingRef.current) {
      bulkMovePendingRef.current = false;
      batchActions.handleBulkMove(selectedAccount.id, selectedAccount.name);
      clearPicker();
    }
  }, [selectedAccount, clearPicker, batchActions.handleBulkMove]);

  useEffect(() => {
    if (!selectedCategory) return;
    if (pendingCategoryRef.current) {
      const txnId = pendingCategoryRef.current;
      pendingCategoryRef.current = null;
      if (selectedCategory.id) updateTransaction(txnId, { category: selectedCategory.id });
      clearPicker();
    } else if (bulkCategoryPendingRef.current) {
      bulkCategoryPendingRef.current = false;
      if (selectedCategory.id) batchActions.handleBulkChangeCategory(selectedCategory.id);
      clearPicker();
    }
  }, [selectedCategory, clearPicker, batchActions.handleBulkChangeCategory]);

  // ---- Upcoming actions (sync-event auto-refreshes previews via liveQuery) ----
  const handlePostSchedule = useCallback(async (scheduleId: string) => {
    await postTransactionForSchedule(scheduleId);
    // sync-event → liveQuery refetch → previews recomputed automatically
  }, []);

  const handleSkipSchedule = useCallback(async (scheduleId: string) => {
    await skipNextDate(scheduleId);
  }, []);

  const handlePostScheduleToday = useCallback(async (scheduleId: string) => {
    await postTransactionForScheduleToday(scheduleId);
  }, []);

  const handleCompleteSchedule = useCallback(async (scheduleId: string) => {
    await updateSchedule({ schedule: { id: scheduleId, completed: true } });
  }, []);

  const handleDeleteSchedule = useCallback((scheduleId: string) => {
    Alert.alert(t("spending.deleteScheduleTitle"), t("spending.deleteScheduleConfirm"), [
      { text: t("cancel"), style: "cancel" },
      {
        text: t("delete"),
        style: "destructive",
        onPress: async () => {
          await deleteSchedule(scheduleId);
        },
      },
    ]);
  }, []);

  const handlePressSchedule = useCallback(
    (scheduleId: string) =>
      router.push({ pathname: "/(auth)/schedule/[id]", params: { id: scheduleId } }),
    [router],
  );

  // ---- Merged list data ----
  const mergedListData = useMemo(
    () =>
      buildListData(transactions as TransactionDisplay[], {
        previewTransactions,
        upcomingExpanded,
      }),
    [transactions, previewTransactions, upcomingExpanded],
  );

  // ---- Common menu actions ----
  const commonActions = useCommonMenuActions();

  // ---- Normal-mode header ----
  useLayoutEffect(() => {
    if (selection.isSelectMode) return;
    navigation.setOptions({
      headerStyle: undefined,
      title: t("spending.title"),
      headerTitle: undefined,
      headerLeft: undefined,
      headerRight: undefined,
    });
  }, [selection.isSelectMode]);

  // ---- Render ----
  return (
    <>
      <LegendList
        data={mergedListData}
        keyExtractor={(item: ListItem) => item.key}
        getItemType={(item: ListItem) => item.type}
        extraData={`${selection.isSelectMode}-${selection.selectedIds.size}`}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="automatic"
        ListHeaderComponent={
          <>
            {!selection.isSelectMode && (
              <Stack.Screen.Title large>{t("spending.title")}</Stack.Screen.Title>
            )}
            {unclearedCount > 0 && (
              <UnclearedPill
                count={unclearedCount}
                onPress={() =>
                  router.push({
                    pathname: "/(auth)/(tabs)/(spending)/search",
                    params: { initialFilter: "uncleared" },
                  })
                }
              />
            )}
          </>
        }
        renderItem={({ item }: { item: ListItem }) => {
          if (item.type === "upcoming-header") {
            return (
              <UpcomingSectionHeader
                count={item.count}
                expanded={item.expanded}
                onToggle={() => {
                  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                  setUpcomingExpanded((v) => !v);
                }}
              />
            );
          }
          if (item.type === "upcoming-date") {
            return <DateSectionHeader date={item.date} />;
          }
          if (item.type === "upcoming") {
            return (
              <UpcomingScheduleRow
                item={item.data}
                onPost={handlePostSchedule}
                onPostToday={handlePostScheduleToday}
                onSkip={handleSkipSchedule}
                onComplete={handleCompleteSchedule}
                onDelete={handleDeleteSchedule}
                onPress={handlePressSchedule}
                showAccountName
                isFirst={item.isFirst}
                isLast={item.isLast}
              />
            );
          }
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
                if (!selection.isSelectMode) setTabBarHidden(true);
                selection.longPress(txnId);
              }}
              onDuplicate={handleDuplicate}
              onMove={handleMove}
              onSetCategory={handleSetCategory}
              onAddTag={handleAddTag}
              showAccountName
              tags={tags}
              isFirst={item.isFirst}
              isLast={item.isLast}
              isSelectMode={selection.isSelectMode}
              isSelected={selection.selectedIds.has(item.data.id)}
            />
          );
        }}
        ListFooterComponent={
          isFetchingNextPage ? (
            <ActivityIndicator color={colors.primary} style={{ paddingVertical: 20 }} />
          ) : null
        }
        ListEmptyComponent={
          <EmptyState
            icon="receiptOutline"
            title={t("spending.noTransactionsYet")}
            description={t("spending.noTransactionsDescription")}
          />
        }
        onEndReached={() => {
          if (hasNextPage) fetchNextPage();
        }}
        onEndReachedThreshold={0.3}
        refreshControl={
          <RefreshControl
            refreshing={false}
            onRefresh={() => refetch()}
            tintColor={colors.primary}
          />
        }
        contentContainerStyle={{ paddingBottom: 80, backgroundColor: colors.pageBackground }}
      />

      {!selection.isSelectMode && <AddTransactionButton collapsed={fabCollapsed} />}

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

      {!selection.isSelectMode && (
        <Stack.Toolbar placement="right">
          <Stack.Toolbar.Button
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setTabBarHidden(true);
              selection.enter();
            }}
          >
            {t("select")}
          </Stack.Toolbar.Button>
          <Stack.Toolbar.Button
            icon="magnifyingglass"
            onPress={() => router.push("/(auth)/(tabs)/(spending)/search")}
          />
          <Stack.Toolbar.Menu icon="ellipsis">{commonActions}</Stack.Toolbar.Menu>
        </Stack.Toolbar>
      )}
    </>
  );
}
