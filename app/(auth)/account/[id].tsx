import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useSharedValue } from "react-native-reanimated";
import { ActivityIndicator, Alert, LayoutAnimation, RefreshControl, View } from "react-native";
import { LegendList } from "@legendapp/list";
import { Stack, useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useTranslation } from "react-i18next";
import {
  deleteTransaction,
  duplicateTransaction,
  toggleCleared,
  updateTransaction,
} from "@core/transactions";
import { useAccounts, useAccountBalance } from "@/presentation/hooks/useAccounts";
import { useTheme, useThemedStyles } from "@/presentation/providers/ThemeProvider";
import { EmptyState } from "@/presentation/components";
import type { Theme } from "@/theme";
import { BalanceSummary } from "@/presentation/components/account/BalanceSummary";
import { TransactionRow } from "@/presentation/components/account/TransactionRow";
import { DateSectionHeader } from "@/presentation/components/account/DateSectionHeader";
import { UpcomingSectionHeader } from "@/presentation/components/account/UpcomingSectionHeader";
import { UpcomingScheduleRow } from "@/presentation/components/account/UpcomingScheduleRow";
import { AddTransactionButton } from "@/presentation/components/molecules/AddTransactionButton";
import { UnclearedPill } from "@/presentation/components/transaction/UnclearedPill";
import { usePrefsStore } from "@/stores/prefsStore";
import { useAccountPref } from "@/presentation/hooks/useAccountPref";
import { usePrivacyStore } from "@/stores/privacyStore";
import { useUndoStore } from "@/stores/undoStore";
import { useCommonMenuActions } from "@/presentation/hooks/useCommonMenuItems";
import { useTags } from "@/presentation/hooks/useTags";
import { useRefreshControl } from "@/presentation/hooks/useRefreshControl";
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
} from "@core/schedules";
import { useTransactions } from "@/presentation/hooks/useTransactions";
import { useSelectionMode } from "@/presentation/hooks/useSelectionMode";
import { useTransactionBatchActions } from "@/presentation/hooks/useTransactionBatchActions";
import { usePreviewTransactions } from "@/presentation/hooks/usePreviewTransactions";
import { useLiveQuery } from "@/presentation/hooks/useQuery";
import { q } from "@core/queries";
import type { TransactionDisplay } from "@core/transactions/types";

export default function AccountTransactionsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useThemedStyles(createScreenStyles);
  const { t } = useTranslation("accounts");
  const { t: tc } = useTranslation("common");
  const { t: tt } = useTranslation("transactions");
  const { accounts } = useAccounts();
  const account = accounts.find((a) => a.id === id);
  const balance = useAccountBalance(id);
  const [hideReconciled, toggleHideReconciled] = useAccountPref(id, "hide-reconciled");
  usePrivacyStore();
  const { tags } = useTags();
  const { refreshControlProps } = useRefreshControl();

  // ---- Upcoming (reactive via liveQuery) ----
  const [upcomingExpanded, setUpcomingExpanded] = useState(false);
  const previewTransactions = usePreviewTransactions({ accountId: id });

  // ---- Transaction data (AQL + React Query + sync-event auto-refresh) ----
  const txnQuery = useMemo(() => {
    let query = q("transactions").filter({ acct: id }).select(["*"]);
    if (hideReconciled) query = query.filter({ reconciled: false });
    return query;
  }, [id, hideReconciled]);
  const { transactions, fetchNextPage, hasNextPage, isFetchingNextPage, refetch } = useTransactions(
    {
      query: txnQuery,
      options: { pageSize: 25, key: `account-${id}` },
    },
  );

  // ---- Cleared balance (reactive via liveQuery) ----
  const clearedBalanceQuery = useMemo(
    () => q("transactions").filter({ acct: id, cleared: true }).calculate({ $sum: "$amount" }),
    [id],
  );
  const { data: clearedBalanceData } = useLiveQuery<{ result: number }>(
    () => clearedBalanceQuery,
    [clearedBalanceQuery],
  );
  const clearedBalance = clearedBalanceData?.[0]?.result ?? 0;

  // ---- Uncleared count (reactive via liveQuery) ----
  const unclearedCountQuery = useMemo(
    () =>
      q("transactions")
        .filter({ acct: id, cleared: false, reconciled: false })
        .calculate({ $count: "$id" }),
    [id],
  );
  const { data: unclearedCountData } = useLiveQuery<{ result: number }>(
    () => unclearedCountQuery,
    [unclearedCountQuery],
  );
  const unclearedCount = unclearedCountData?.[0]?.result ?? 0;

  // ---- Cleared count for reconciliation ----
  const clearedCountQuery = useMemo(
    () =>
      q("transactions")
        .filter({ acct: id, cleared: true, reconciled: false })
        .calculate({ $count: "$id" }),
    [id],
  );
  const { data: clearedCountData } = useLiveQuery<{ result: number }>(
    () => clearedCountQuery,
    [clearedCountQuery],
  );
  const clearedCount = clearedCountData?.[0]?.result ?? 0;

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
    onDone: selection.exit,
  });

  // ---- Select mode header ----
  useSelectModeHeader({
    isSelectMode: selection.isSelectMode,
    selectedCount: selection.selectedIds.size,
    selectedTotal,
    onDoneSelection: selection.exit,
  });

  // ---- Scroll-driven FAB collapse ----
  const fabCollapsed = useSharedValue(false);
  const handleScroll = useCallback((e: { nativeEvent: { contentOffset: { y: number } } }) => {
    fabCollapsed.value = e.nativeEvent.contentOffset.y > 100;
  }, []);

  // Reset selection on blur
  useFocusEffect(
    useCallback(() => {
      return () => {
        if (!bulkMovePendingRef.current && !bulkCategoryPendingRef.current) {
          selection.exit();
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
        },
      },
    ]);
  }

  function handleToggleCleared(txnId: string) {
    toggleCleared(txnId);
  }

  async function handleDuplicate(txnId: string) {
    await duplicateTransaction(txnId);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }

  function handleAddTag(txnId: string) {
    router.push({
      pathname: "/(auth)/transaction/tags",
      params: { transactionId: txnId, mode: "direct" },
    });
  }

  // ---- Picker integration ----
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

  // ---- Upcoming actions (sync-event auto-refreshes via liveQuery) ----
  const handlePostSchedule = useCallback(async (scheduleId: string) => {
    await postTransactionForSchedule(scheduleId);
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
    Alert.alert(t("detail.deleteScheduleTitle"), t("detail.deleteScheduleMessage"), [
      { text: tc("cancel"), style: "cancel" },
      {
        text: tc("delete"),
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
        hideReconciled,
      }),
    [transactions, previewTransactions, upcomingExpanded, hideReconciled],
  );

  // ---- Common menu actions ----
  const commonActions = useCommonMenuActions();

  // ---- Normal-mode header ----
  useLayoutEffect(() => {
    if (selection.isSelectMode) return;
    navigation.setOptions({
      title: account?.name ?? t("detail.defaultTitle"),
      headerTitle: undefined,
      headerLeft: undefined,
      headerRight: undefined,
    });
  }, [account?.name, selection.isSelectMode]);

  // ---- Render ----
  return (
    <View style={styles.container}>
      <BalanceSummary
        balance={balance}
        clearedBalance={clearedBalance}
        lastReconciled={account?.lastReconciled}
      />

      {unclearedCount > 0 && (
        <UnclearedPill
          count={unclearedCount}
          onPress={() =>
            router.push({
              pathname: "/(auth)/account/search",
              params: {
                accountId: id,
                accountName: account?.name ?? t("detail.defaultTitle"),
                initialFilter: "uncleared",
              },
            })
          }
        />
      )}

      <LegendList
        data={mergedListData}
        keyExtractor={(item: ListItem) => item.key}
        getItemType={(item: ListItem) => item.type}
        extraData={`${selection.isSelectMode}-${selection.selectedIds.size}`}
        onScroll={handleScroll}
        scrollEventThrottle={16}
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
                isFirst={item.isFirst}
                isLast={item.isLast}
              />
            );
          }
          if (item.type === "empty-state") {
            return item.variant === "reconciled" ? (
              <EmptyState
                icon="lockClosedOutline"
                title={t("detail.allReconciled.title")}
                description={t("detail.allReconciled.description")}
                actionLabel={t("detail.allReconciled.showAll")}
                onAction={toggleHideReconciled}
              />
            ) : (
              <EmptyState
                icon="receiptOutline"
                title={t("detail.noTransactions.title")}
                description={t("detail.noTransactions.description")}
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
          isFetchingNextPage ? (
            <ActivityIndicator color={colors.primary} style={{ paddingVertical: 20 }} />
          ) : null
        }
        ListEmptyComponent={
          hideReconciled ? (
            <EmptyState
              icon="lockClosedOutline"
              title={t("detail.allReconciled.title")}
              description={t("detail.allReconciled.description")}
              actionLabel={t("detail.allReconciled.showAll")}
              onAction={toggleHideReconciled}
            />
          ) : (
            <EmptyState
              icon="receiptOutline"
              title={t("detail.noTransactions.title")}
              description={t("detail.noTransactions.description")}
            />
          )
        }
        onEndReached={() => {
          if (hasNextPage) fetchNextPage();
        }}
        onEndReachedThreshold={0.3}
        contentContainerStyle={{ paddingBottom: 80 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshControlProps.refreshing}
            onRefresh={refreshControlProps.onRefresh}
            tintColor={refreshControlProps.tintColor}
          />
        }
      />

      {!selection.isSelectMode && (
        <AddTransactionButton accountId={id as string} bottom={28} collapsed={fabCollapsed} />
      )}

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
              selection.enter();
            }}
          >
            {t("detail.select")}
          </Stack.Toolbar.Button>
          <Stack.Toolbar.Button
            icon="magnifyingglass"
            onPress={() =>
              router.push({
                pathname: "/(auth)/account/search",
                params: { accountId: id, accountName: account?.name ?? t("detail.defaultTitle") },
              })
            }
          />
          <Stack.Toolbar.Menu icon="ellipsis">
            <Stack.Toolbar.MenuAction
              icon="lock"
              onPress={() =>
                router.push({
                  pathname: "/(auth)/account/reconcile",
                  params: {
                    accountId: id,
                    clearedBalance: String(clearedBalance),
                    clearedCount: String(clearedCount),
                    lastReconciled: account?.lastReconciled ?? "",
                  },
                })
              }
            >
              {t("detail.reconcile")}
            </Stack.Toolbar.MenuAction>
            <Stack.Toolbar.MenuAction
              icon={
                hideReconciled
                  ? "line.3.horizontal.decrease.circle"
                  : "line.3.horizontal.decrease.circle.fill"
              }
              onPress={toggleHideReconciled}
            >
              {hideReconciled ? t("detail.showReconciled") : t("detail.hideReconciled")}
            </Stack.Toolbar.MenuAction>
            <Stack.Toolbar.MenuAction
              icon="pencil"
              onPress={() => router.push({ pathname: "/(auth)/account/settings", params: { id } })}
            >
              {t("detail.editAccount")}
            </Stack.Toolbar.MenuAction>
            {commonActions}
          </Stack.Toolbar.Menu>
        </Stack.Toolbar>
      )}
    </View>
  );
}

const createScreenStyles = (theme: Theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.pageBackground,
  },
});
