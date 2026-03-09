import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useSharedValue } from 'react-native-reanimated';
import {
  ActivityIndicator,
  Alert,
  LayoutAnimation,
  RefreshControl,
  View,
} from 'react-native';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useAccountsStore } from '../../../src/stores/accountsStore';
import {
  getClearedBalance,
  getTransactionsForAccount,
  getUnclearedCount,
} from '../../../src/transactions';
import { useTheme, useThemedStyles } from '../../../src/presentation/providers/ThemeProvider';
import { EmptyState } from '../../../src/presentation/components';
import type { Theme } from '../../../src/theme';

import { BalanceSummary } from '../../../src/presentation/components/account/BalanceSummary';
import { TransactionRow } from '../../../src/presentation/components/account/TransactionRow';
import { DateSectionHeader } from '../../../src/presentation/components/account/DateSectionHeader';
import { UpcomingSectionHeader } from '../../../src/presentation/components/account/UpcomingSectionHeader';
import { UpcomingScheduleRow } from '../../../src/presentation/components/account/UpcomingScheduleRow';
import { AddTransactionButton } from '../../../src/presentation/components/molecules/AddTransactionButton';
import { UnclearedPill } from '../../../src/presentation/components/transaction/UnclearedPill';
import { usePrefsStore } from '../../../src/stores/prefsStore';
import { usePrivacyStore } from '../../../src/stores/privacyStore';
import { useUndoStore } from '../../../src/stores/undoStore';
import { getCommonMenuItems } from '../../../src/presentation/hooks/useCommonMenuItems';
import { useTagsStore } from '../../../src/stores/tagsStore';
import {
  buildListData,
  useSelectModeHeader,
  useTransactionList,
  type ListItem,
} from '../../../src/presentation/hooks/transactionList';
import { SelectModeToolbar } from '../../../src/presentation/components/transaction/SelectModeToolbar';
import { getPreviewTransactionsForAccount, type PreviewTransaction } from '../../../src/schedules/preview';
import {
  skipNextDate,
  postTransactionForSchedule,
  postTransactionForScheduleToday,
  deleteSchedule,
  updateSchedule,
} from '../../../src/schedules';
import { useSchedulesStore } from '../../../src/stores/schedulesStore';

export default function AccountTransactionsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useThemedStyles(createScreenStyles);
  const { accounts, load: loadAccounts } = useAccountsStore();
  const account = accounts.find(a => a.id === id);

  const [clearedBalance, setClearedBalance] = useState(0);
  const [unclearedCount, setUnclearedCount] = useState(0);
  const { hideReconciled, toggleHideReconciled } = usePrefsStore();
  const { privacyMode } = usePrivacyStore();
  const canUndo = useUndoStore((s) => s.canUndo);
  const undoVersion = useUndoStore((s) => s.undoVersion);
  const tags = useTagsStore((s) => s.tags);

  // ---- Upcoming scheduled transactions ----
  const listRef = useRef<FlashListRef<ListItem>>(null);
  const [upcomingExpanded, setUpcomingExpanded] = useState(false);
  const [previewTransactions, setPreviewTransactions] = useState<PreviewTransaction[]>([]);

  // ---- Consolidated transaction list ----
  const fetchTransactions = useCallback(
    (limit: number, offset: number) => {
      const hide = usePrefsStore.getState().hideReconciled;
      return getTransactionsForAccount(id, { limit, offset, hideReconciled: hide });
    },
    [id],
  );

  const txnList = useTransactionList({
    fetchTransactions,
    moveMode: 'remove',
    onDelete: (txn) => {
      if (!txn.cleared && !txn.reconciled) {
        setUnclearedCount(c => Math.max(0, c - 1));
      }
    },
    onDuplicate: () => {
      setUnclearedCount(c => c + 1);
    },
    onToggleCleared: (txn) => {
      if (!txn.reconciled) {
        setUnclearedCount(c => Math.max(0, c + (txn.cleared ? 1 : -1)));
      }
      const delta = txn.cleared ? -txn.amount : txn.amount;
      setClearedBalance(prev => prev + delta);
    },
    onBulkToggleCleared: (_ids, targetVal, affectedTxns) => {
      let balanceDelta = 0;
      for (const t of affectedTxns) {
        balanceDelta += t.cleared ? -t.amount : t.amount;
      }
      setClearedBalance(prev => prev + balanceDelta);
      const unclearedDelta = affectedTxns.filter(t => !t.cleared).length;
      setUnclearedCount(c => Math.max(0, targetVal ? c - unclearedDelta : c + unclearedDelta));
    },
  });

  // Load previews, balance, and uncleared count BEFORE transactions
  // so everything is ready when the FlashList first renders.
  const loadWithClearedBalance = useCallback(async () => {
    const [previews, cleared, uncleared] = await Promise.all([
      getPreviewTransactionsForAccount(id),
      getClearedBalance(id),
      getUnclearedCount(id),
    ]);
    setPreviewTransactions(previews);
    setClearedBalance(cleared);
    setUnclearedCount(uncleared);
    await txnList.loadAll();
  }, [txnList.loadAll, id]);

  const silentRefreshWithBalance = useCallback(async () => {
    const [previews, cleared, uncleared] = await Promise.all([
      getPreviewTransactionsForAccount(id),
      getClearedBalance(id),
      getUnclearedCount(id),
    ]);
    setPreviewTransactions(previews);
    setClearedBalance(cleared);
    setUnclearedCount(uncleared);
    await txnList.silentRefresh();
  }, [txnList.silentRefresh, id]);

  // ---- Select mode header ----
  useSelectModeHeader({
    isSelectMode: txnList.isSelectMode,
    selectedCount: txnList.selectedIds.size,
    selectedTotal: txnList.selectedTotal,
    onSelectAll: txnList.handleSelectAll,
    onDoneSelection: txnList.handleDoneSelection,
  });

  // ---- Scroll-driven FAB collapse ----
  const fabCollapsed = useSharedValue(false);
  const handleScroll = useCallback((e: { nativeEvent: { contentOffset: { y: number } } }) => {
    fabCollapsed.value = e.nativeEvent.contentOffset.y > 100;
  }, []);

  // ---- Data loading ----
  useFocusEffect(useCallback(() => {
    if (!txnList.hasLoaded.current) {
      loadWithClearedBalance();
      txnList.hasLoaded.current = true;
    } else {
      silentRefreshWithBalance();
    }
    return () => { txnList.resetSelection(); };
  }, [loadWithClearedBalance, silentRefreshWithBalance, txnList.resetSelection]));

  // Refresh local list after undo restores data in DB
  useEffect(() => {
    if (undoVersion > 0) {
      setTimeout(() => {
        txnList.restoreDeleted();
        txnList.restoreBulkDeleted();
        silentRefreshWithBalance();
      }, 0);
    }
  }, [undoVersion]);

  // ---- Account-specific handlers ----

  function handleToggleHideReconciled() {
    toggleHideReconciled();
    loadWithClearedBalance();
  }

  // ---- Upcoming actions ----
  const handlePostSchedule = useCallback(async (scheduleId: string) => {
    await postTransactionForSchedule(scheduleId);
    await Promise.all([
      silentRefreshWithBalance(),
      useSchedulesStore.getState().load(),
    ]);
  }, [silentRefreshWithBalance]);

  const handleSkipSchedule = useCallback(async (scheduleId: string) => {
    await skipNextDate(scheduleId);
    const [previews] = await Promise.all([
      getPreviewTransactionsForAccount(id),
      useSchedulesStore.getState().load(),
    ]);
    setPreviewTransactions(previews);
  }, [id]);

  const handlePostScheduleToday = useCallback(async (scheduleId: string) => {
    await postTransactionForScheduleToday(scheduleId);
    await Promise.all([
      silentRefreshWithBalance(),
      useSchedulesStore.getState().load(),
    ]);
  }, [silentRefreshWithBalance]);

  const handleCompleteSchedule = useCallback(async (scheduleId: string) => {
    await updateSchedule({ schedule: { id: scheduleId, completed: true } });
    const [previews] = await Promise.all([
      getPreviewTransactionsForAccount(id),
      useSchedulesStore.getState().load(),
    ]);
    setPreviewTransactions(previews);
  }, [id]);

  const handleDeleteSchedule = useCallback((scheduleId: string) => {
    Alert.alert('Delete Schedule', 'Delete this schedule and all future occurrences?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteSchedule(scheduleId);
          const [previews] = await Promise.all([
            getPreviewTransactionsForAccount(id),
            useSchedulesStore.getState().load(),
          ]);
          setPreviewTransactions(previews);
        },
      },
    ]);
  }, [id]);

  const handlePressSchedule = useCallback((scheduleId: string) => {
    router.push({ pathname: '/(auth)/schedule/[id]', params: { id: scheduleId } });
  }, [router]);

  // ---- Merged list data (transactions + upcoming) ----
  const mergedListData = useMemo(
    () => buildListData(txnList.transactions, {
      previewTransactions,
      upcomingExpanded,
    }),
    [txnList.transactions, previewTransactions, upcomingExpanded],
  );

  // ---- Normal-mode header ----
  useLayoutEffect(() => {
    if (txnList.isSelectMode) return;
    navigation.setOptions({
      title: account?.name ?? 'Account',
      headerTitle: undefined,
      headerLeft: undefined,
      headerRight: undefined,
      unstable_headerRightItems: () => [
        {
          type: 'button' as const,
          icon: { type: 'sfSymbol' as const, name: 'magnifyingglass' },
          onPress: () => router.push({
            pathname: '/(auth)/account/search',
            params: { accountId: id, accountName: account?.name ?? 'Account' },
          }),
        },
        {
          type: 'button' as const,
          label: 'Select',
          onPress: txnList.enterSelectMode,
        },
        {
          type: 'menu' as const,
          icon: { type: 'sfSymbol' as const, name: 'ellipsis' },
          menu: {
            items: [
              {
                type: 'action' as const,
                label: 'Reconcile',
                icon: { type: 'sfSymbol' as const, name: 'lock' },
                onPress: () => router.push({
                  pathname: '/(auth)/account/reconcile',
                  params: { accountId: id, clearedBalance: String(clearedBalance) },
                }),
              },
              {
                type: 'action' as const,
                label: hideReconciled ? 'Show Reconciled' : 'Hide Reconciled',
                icon: { type: 'sfSymbol' as const, name: hideReconciled ? 'checkmark.circle' : 'checkmark.circle.badge.xmark' },
                onPress: handleToggleHideReconciled,
              },
              {
                type: 'action' as const,
                label: 'Edit Account',
                icon: { type: 'sfSymbol' as const, name: 'pencil' },
                onPress: () => router.push({ pathname: '/(auth)/account/settings', params: { id } }),
              },
              ...getCommonMenuItems(router),
            ],
          },
        },
      ],
    });
  }, [account?.name, id, txnList.isSelectMode, hideReconciled, privacyMode, canUndo, clearedBalance]);

  // ---- Render ----

  return (
    <View style={styles.container}>
      <BalanceSummary
        balance={account?.balance ?? 0}
        clearedBalance={clearedBalance}
        lastReconciled={account?.lastReconciled}
      />

      {unclearedCount > 0 && (
        <UnclearedPill
          count={unclearedCount}
          onPress={() => router.push({
            pathname: '/(auth)/account/search',
            params: { accountId: id, accountName: account?.name ?? 'Account', initialFilter: 'uncleared' },
          })}
        />
      )}

      {txnList.loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlashList<ListItem>
          ref={listRef}
          data={mergedListData}
          keyExtractor={(item) => item.key}
          getItemType={(item) => item.type}

          onScroll={handleScroll}
          scrollEventThrottle={16}
          renderItem={({ item }) => {
            if (item.type === 'upcoming-header') {
              return (
                <UpcomingSectionHeader
                  count={item.count}
                  expanded={item.expanded}
                  onToggle={() => {
                    listRef.current?.prepareForLayoutAnimationRender();
                    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                    setUpcomingExpanded((v) => !v);
                  }}
                />
              );
            }
            if (item.type === 'upcoming') {
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
            if (item.type === 'date') {
              return <DateSectionHeader date={item.date} />;
            }
            return (
              <TransactionRow
                item={item.data}
                onPress={txnList.handleEditTransaction}
                onDelete={txnList.handleDelete}
                onToggleCleared={txnList.handleToggleCleared}
                onLongPress={txnList.handleLongPress}
                onDuplicate={txnList.handleDuplicate}
                onMove={txnList.handleMove}
                onSetCategory={txnList.handleSetCategory}
                onAddTag={txnList.handleAddTag}
                tags={tags}
                isFirst={item.isFirst}
                isLast={item.isLast}
                isSelectMode={txnList.isSelectMode}
                isSelected={txnList.selectedIds.has(item.data.id)}
              />
            );
          }}
          ListFooterComponent={
            txnList.loadingMore
              ? <ActivityIndicator color={colors.primary} style={{ paddingVertical: 20 }} />
              : null
          }
          ListEmptyComponent={
            hideReconciled
              ? <EmptyState
                  icon="lock-closed-outline"
                  title="All transactions reconciled"
                  description="Reconciled transactions are hidden"
                  actionLabel="Show All"
                  onAction={handleToggleHideReconciled}
                />
              : <EmptyState
                  icon="receipt-outline"
                  title="No transactions yet"
                  description="Add your first transaction to get started"
                />
          }
          onEndReached={txnList.loadMore}
          onEndReachedThreshold={0.3}
          contentContainerStyle={{ paddingBottom: 80 }}
          refreshControl={
            <RefreshControl {...txnList.refreshControlProps} />
          }
        />
      )}

      {!txnList.isSelectMode && (
        <AddTransactionButton accountId={id as string} bottom={28} collapsed={fabCollapsed} />
      )}

      {txnList.isSelectMode && (
        <SelectModeToolbar
          allCleared={txnList.allCleared}
          selectedCount={txnList.selectedIds.size}
          onToggleCleared={txnList.handleBulkToggleCleared}
          onDelete={txnList.handleBulkDelete}
          onMove={txnList.triggerAccountPicker}
          onSetCategory={txnList.triggerCategoryPicker}
        />
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
