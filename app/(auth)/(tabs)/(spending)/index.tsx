import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { useSharedValue } from 'react-native-reanimated';
import {
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Stack, useFocusEffect, useNavigation, useRouter } from 'expo-router';
import {
  getAllTransactions,
  getUnclearedCount,
} from '../../../../src/transactions';
import { usePrivacyStore } from '../../../../src/stores/privacyStore';
import { useUndoStore } from '../../../../src/stores/undoStore';
import { getCommonMenuItems } from '../../../../src/presentation/hooks/useCommonMenuItems';
import { useTabBarStore } from '../../../../src/stores/tabBarStore';
import { useTheme } from '../../../../src/presentation/providers/ThemeProvider';
import { EmptyState } from '../../../../src/presentation/components';
import { UnclearedPill } from '../../../../src/presentation/components/transaction/UnclearedPill';
import { TransactionRow } from '../../../../src/presentation/components/account/TransactionRow';
import { DateSectionHeader } from '../../../../src/presentation/components/account/DateSectionHeader';
import { AddTransactionButton } from '../../../../src/presentation/components/molecules/AddTransactionButton';
import { useTagsStore } from '../../../../src/stores/tagsStore';
import {
  useSelectModeHeader,
  useTransactionList,
  type ListItem,
} from '../../../../src/presentation/hooks/transactionList';
import { SelectModeToolbar } from '../../../../src/presentation/components/transaction/SelectModeToolbar';

export default function SpendingScreen() {
  const navigation = useNavigation();
  const router = useRouter();
  const { colors } = useTheme();
  const { privacyMode } = usePrivacyStore();
  const canUndo = useUndoStore((s) => s.canUndo);
  const undoVersion = useUndoStore((s) => s.undoVersion);
  const setTabBarHidden = useTabBarStore((s) => s.setHidden);
  const tags = useTagsStore((s) => s.tags);
  const [unclearedCount, setUnclearedCount] = useState(0);

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
  useFocusEffect(useCallback(() => {
    if (!txnList.hasLoaded.current) {
      txnList.loadAll();
      txnList.hasLoaded.current = true;
    } else {
      txnList.silentRefresh();
    }
    getUnclearedCount().then(setUnclearedCount);
    return () => { txnList.resetSelection(); };
  }, [txnList.loadAll, txnList.silentRefresh, txnList.resetSelection]));

  // Refresh local list after undo restores data in DB
  useEffect(() => {
    if (undoVersion > 0) {
      setTimeout(() => {
        txnList.restoreDeleted();
        txnList.restoreBulkDeleted();
        txnList.silentRefresh();
        getUnclearedCount().then(setUnclearedCount);
      }, 0);
    }
  }, [undoVersion]);

  // ---- Normal-mode header ----
  useLayoutEffect(() => {
    if (txnList.isSelectMode) return;
    navigation.setOptions({
      title: 'Spending',
      headerTitle: undefined,
      headerLeft: undefined,
      headerRight: undefined,
      unstable_headerRightItems: () => [
        {
          type: 'button' as const,
          icon: { type: 'sfSymbol' as const, name: 'magnifyingglass' },
          onPress: () => router.push('/(auth)/(tabs)/(spending)/search'),
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
            items: getCommonMenuItems(router),
          },
        },
      ],
    });
  }, [txnList.isSelectMode, privacyMode, canUndo]);

  // ---- Render ----

  return (
    <>
      <FlashList<ListItem>
        data={txnList.loading ? [] : txnList.listData}
        keyExtractor={(item) => item.key}
        getItemType={(item) => item.type}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="automatic"
        ListHeaderComponent={
          !txnList.isSelectMode ? (
            <>
              <Stack.Screen.Title large>Spending</Stack.Screen.Title>
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
                title="No transactions yet"
                description="Add your first transaction to get started"
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
    </>
  );
}
