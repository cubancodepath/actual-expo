import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useSharedValue } from 'react-native-reanimated';
import {
  ActivityIndicator,
  Alert,
  LayoutAnimation,
  RefreshControl,
} from 'react-native';
import { LegendList } from '@legendapp/list';
import { Stack, useFocusEffect, useNavigation, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  getAllTransactions,
  getUnclearedCount,
} from '../../../../src/transactions';
import { usePrivacyStore } from '../../../../src/stores/privacyStore';
import { useUndoStore } from '../../../../src/stores/undoStore';
import { useCommonMenuActions } from '../../../../src/presentation/hooks/useCommonMenuItems';
import { useTabBarStore } from '../../../../src/stores/tabBarStore';
import { useTheme } from '../../../../src/presentation/providers/ThemeProvider';
import { EmptyState } from '../../../../src/presentation/components';
import { UnclearedPill } from '../../../../src/presentation/components/transaction/UnclearedPill';
import { TransactionRow } from '../../../../src/presentation/components/account/TransactionRow';
import { DateSectionHeader } from '../../../../src/presentation/components/account/DateSectionHeader';
import { UpcomingSectionHeader } from '../../../../src/presentation/components/account/UpcomingSectionHeader';
import { UpcomingScheduleRow } from '../../../../src/presentation/components/account/UpcomingScheduleRow';
import { AddTransactionButton } from '../../../../src/presentation/components/molecules/AddTransactionButton';
import { useTagsStore } from '../../../../src/stores/tagsStore';
import {
  buildListData,
  useSelectModeHeader,
  useTransactionList,
  type ListItem,
} from '../../../../src/presentation/hooks/transactionList';
import { SelectModeToolbar } from '../../../../src/presentation/components/transaction/SelectModeToolbar';
import { getAllPreviewTransactions, type PreviewTransaction } from '../../../../src/schedules/preview';
import {
  skipNextDate,
  postTransactionForSchedule,
  postTransactionForScheduleToday,
  deleteSchedule,
  updateSchedule,
} from '../../../../src/schedules';
import { useSchedulesStore } from '../../../../src/stores/schedulesStore';

export default function SpendingScreen() {
  const navigation = useNavigation();
  const router = useRouter();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { privacyMode } = usePrivacyStore();
  const canUndo = useUndoStore((s) => s.canUndo);
  const undoVersion = useUndoStore((s) => s.undoVersion);
  const setTabBarHidden = useTabBarStore((s) => s.setHidden);
  const tags = useTagsStore((s) => s.tags);
  const [unclearedCount, setUnclearedCount] = useState(0);

  // ---- Upcoming scheduled transactions ----
  const [upcomingExpanded, setUpcomingExpanded] = useState(false);
  const [previewTransactions, setPreviewTransactions] = useState<PreviewTransaction[]>([]);

  // ---- Consolidated transaction list ----
  const fetchTransactions = useCallback(
    (limit: number, offset: number) => getAllTransactions({ limit, offset }),
    [],
  );

  const txnList = useTransactionList({
    fetchTransactions,
    moveMode: 'remap',
    onEnterSelectMode: () => setTabBarHidden(true),
    onExitSelectMode: () => setTabBarHidden(false),
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
    },
    optimisticBulkMove: (prev, ids, targetAccountId, targetAccountName) =>
      prev.map(t => ids.has(t.id) ? { ...t, acct: targetAccountId, accountName: targetAccountName } : t),
    onBulkToggleCleared: (_ids, targetVal, affectedTxns) => {
      const delta = affectedTxns.filter(t => !t.cleared).length;
      setUnclearedCount(c => Math.max(0, targetVal ? c - delta : c + delta));
    },
  });

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
  const loadWithPreviews = useCallback(async () => {
    const [previews, uncleared] = await Promise.all([
      getAllPreviewTransactions(),
      getUnclearedCount(),
    ]);
    setPreviewTransactions(previews);
    setUnclearedCount(uncleared);
    await txnList.loadAll();
  }, [txnList.loadAll]);

  const silentRefreshWithPreviews = useCallback(async () => {
    const [previews, uncleared] = await Promise.all([
      getAllPreviewTransactions(),
      getUnclearedCount(),
    ]);
    setPreviewTransactions(previews);
    setUnclearedCount(uncleared);
    await txnList.silentRefresh();
  }, [txnList.silentRefresh]);

  useFocusEffect(useCallback(() => {
    if (!txnList.hasLoaded.current) {
      loadWithPreviews();
      txnList.hasLoaded.current = true;
    } else {
      silentRefreshWithPreviews();
    }
    return () => { txnList.resetSelection(); };
  }, [loadWithPreviews, silentRefreshWithPreviews, txnList.resetSelection]));

  // Refresh local list after undo restores data in DB
  useEffect(() => {
    if (undoVersion > 0) {
      setTimeout(() => {
        txnList.restoreDeleted();
        txnList.restoreBulkDeleted();
        silentRefreshWithPreviews();
      }, 0);
    }
  }, [undoVersion]);

  // ---- Upcoming actions ----
  const handlePostSchedule = useCallback(async (scheduleId: string) => {
    await postTransactionForSchedule(scheduleId);
    await Promise.all([
      silentRefreshWithPreviews(),
      useSchedulesStore.getState().load(),
    ]);
  }, [silentRefreshWithPreviews]);

  const handleSkipSchedule = useCallback(async (scheduleId: string) => {
    await skipNextDate(scheduleId);
    const [previews] = await Promise.all([
      getAllPreviewTransactions(),
      useSchedulesStore.getState().load(),
    ]);
    setPreviewTransactions(previews);
  }, []);

  const handlePostScheduleToday = useCallback(async (scheduleId: string) => {
    await postTransactionForScheduleToday(scheduleId);
    await Promise.all([
      silentRefreshWithPreviews(),
      useSchedulesStore.getState().load(),
    ]);
  }, [silentRefreshWithPreviews]);

  const handleCompleteSchedule = useCallback(async (scheduleId: string) => {
    await updateSchedule({ schedule: { id: scheduleId, completed: true } });
    const [previews] = await Promise.all([
      getAllPreviewTransactions(),
      useSchedulesStore.getState().load(),
    ]);
    setPreviewTransactions(previews);
  }, []);

  const handleDeleteSchedule = useCallback((scheduleId: string) => {
    Alert.alert(t('spending.deleteScheduleTitle'), t('spending.deleteScheduleConfirm'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('delete'),
        style: 'destructive',
        onPress: async () => {
          await deleteSchedule(scheduleId);
          const [previews] = await Promise.all([
            getAllPreviewTransactions(),
            useSchedulesStore.getState().load(),
          ]);
          setPreviewTransactions(previews);
        },
      },
    ]);
  }, []);

  const handlePressSchedule = useCallback((scheduleId: string) => {
    router.push({ pathname: '/(auth)/schedule/[id]', params: { id: scheduleId } });
  }, [router]);

  // ---- Merged list data ----
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
      headerStyle: undefined,
      title: t('spending.title'),
      headerTitle: undefined,
      headerLeft: undefined,
      headerRight: undefined,
    });
  }, [txnList.isSelectMode]);

  // ---- Render ----

  return (
    <>
      <LegendList
        data={txnList.loading ? [] : mergedListData}
        keyExtractor={(item) => item.key}
        getItemType={(item) => item.type}
        extraData={`${txnList.isSelectMode}-${txnList.selectedIds.size}`}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="automatic"
        ListHeaderComponent={
          !txnList.isSelectMode ? (
            <>
              <Stack.Screen.Title large>{t('spending.title')}</Stack.Screen.Title>
              {unclearedCount > 0 && (
                <UnclearedPill
                  count={unclearedCount}
                  onPress={() => router.push({
                    pathname: '/(auth)/(tabs)/(spending)/search',
                    params: { initialFilter: 'uncleared' },
                  })}
                />
              )}
            </>
          ) : null
        }
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
          if (item.type !== 'transaction') return null;
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
              showAccountName
              tags={tags}
              isFirst={item.isFirst}
              isLast={item.isLast}
              isSelectMode={txnList.isSelectMode}
              isSelected={txnList.selectedIds.has(item.data.id)}
            />
          );
        }}
        ListFooterComponent={
          txnList.loadingMore && !txnList.loading
            ? <ActivityIndicator color={colors.primary} style={{ paddingVertical: 20 }} />
            : null
        }
        ListEmptyComponent={
          txnList.loading
            ? <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
            : <EmptyState
                icon="receipt-outline"
                title={t('spending.noTransactionsYet')}
                description={t('spending.noTransactionsDescription')}
              />
        }
        onEndReached={txnList.loadMore}
        onEndReachedThreshold={0.3}
        refreshControl={
          <RefreshControl {...txnList.refreshControlProps} />
        }
        contentContainerStyle={{ paddingBottom: 80, backgroundColor: colors.pageBackground }}
      />

      {!txnList.isSelectMode && (
        <AddTransactionButton collapsed={fabCollapsed} />
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
          <Stack.Toolbar.Button onPress={txnList.enterSelectMode}>{t('select')}</Stack.Toolbar.Button>
          <Stack.Toolbar.Button
            icon="magnifyingglass"
            onPress={() => router.push('/(auth)/(tabs)/(spending)/search')}
          />
          <Stack.Toolbar.Menu icon="ellipsis">
            {commonActions}
          </Stack.Toolbar.Menu>
        </Stack.Toolbar>
      )}
    </>
  );
}
