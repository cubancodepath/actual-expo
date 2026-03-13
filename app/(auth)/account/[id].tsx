import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useSharedValue } from 'react-native-reanimated';
import {
  ActivityIndicator,
  Alert,
  LayoutAnimation,
  RefreshControl,
  View,
} from 'react-native';
import { LegendList } from '@legendapp/list';
import { Stack, useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
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
import { useCommonMenuActions } from '../../../src/presentation/hooks/useCommonMenuItems';
import { useTagsStore } from '../../../src/stores/tagsStore';
import { TransactionListSkeleton } from '../../../src/presentation/components/skeletons/TransactionListSkeleton';
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
import { useTranslation } from 'react-i18next';

export default function AccountTransactionsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useThemedStyles(createScreenStyles);
  const { t } = useTranslation('accounts');
  const { t: tc } = useTranslation('common');
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
      loadAccounts();
    },
    onDuplicate: () => {
      setUnclearedCount(c => c + 1);
      loadAccounts();
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
  // so everything is ready when the list first renders.
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
      loadAccounts(),
    ]);
    setPreviewTransactions(previews);
    setClearedBalance(cleared);
    setUnclearedCount(uncleared);
    await txnList.silentRefresh();
  }, [txnList.silentRefresh, id, loadAccounts]);

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
    Alert.alert(t('detail.deleteScheduleTitle'), t('detail.deleteScheduleMessage'), [
      { text: tc('cancel'), style: 'cancel' },
      {
        text: tc('delete'),
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

  // ---- Common menu actions (JSX) ----
  const commonActions = useCommonMenuActions();

  // ---- Normal-mode header ----
  useLayoutEffect(() => {
    if (txnList.isSelectMode) return;
    navigation.setOptions({
      title: account?.name ?? t('detail.defaultTitle'),
      headerTitle: undefined,
      headerLeft: undefined,
      headerRight: undefined,
    });
  }, [account?.name, txnList.isSelectMode]);

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
            params: { accountId: id, accountName: account?.name ?? t('detail.defaultTitle'), initialFilter: 'uncleared' },
          })}
        />
      )}

      {txnList.loading ? (
        <TransactionListSkeleton />
      ) : (
        <LegendList
          data={mergedListData}
          keyExtractor={(item) => item.key}
          getItemType={(item) => item.type}
          extraData={`${txnList.isSelectMode}-${txnList.selectedIds.size}`}

          onScroll={handleScroll}
          scrollEventThrottle={16}
          renderItem={({ item }) => {
            if (item.type === 'upcoming-header') {
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
                  title={t('detail.allReconciled.title')}
                  description={t('detail.allReconciled.description')}
                  actionLabel={t('detail.allReconciled.showAll')}
                  onAction={handleToggleHideReconciled}
                />
              : <EmptyState
                  icon="receipt-outline"
                  title={t('detail.noTransactions.title')}
                  description={t('detail.noTransactions.description')}
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

      {!txnList.isSelectMode && (
        <Stack.Toolbar placement="right">
          <Stack.Toolbar.Button onPress={txnList.enterSelectMode}>{t('detail.select')}</Stack.Toolbar.Button>
          <Stack.Toolbar.Button
            icon="magnifyingglass"
            onPress={() => router.push({
              pathname: '/(auth)/account/search',
              params: { accountId: id, accountName: account?.name ?? t('detail.defaultTitle') },
            })}
          />
          <Stack.Toolbar.Menu icon="ellipsis">
            <Stack.Toolbar.MenuAction
              icon="lock"
              onPress={() => router.push({
                pathname: '/(auth)/account/reconcile',
                params: { accountId: id, clearedBalance: String(clearedBalance) },
              })}
            >
              {t('detail.reconcile')}
            </Stack.Toolbar.MenuAction>
            <Stack.Toolbar.MenuAction
              icon={hideReconciled ? 'checkmark.circle' : 'checkmark.circle.badge.xmark'}
              onPress={handleToggleHideReconciled}
            >
              {hideReconciled ? t('detail.showReconciled') : t('detail.hideReconciled')}
            </Stack.Toolbar.MenuAction>
            <Stack.Toolbar.MenuAction
              icon="pencil"
              onPress={() => router.push({ pathname: '/(auth)/account/settings', params: { id } })}
            >
              {t('detail.editAccount')}
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
