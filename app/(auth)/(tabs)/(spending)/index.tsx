import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { useSharedValue } from 'react-native-reanimated';
import {
  ActivityIndicator,
  RefreshControl,
  View,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Stack, useFocusEffect, useNavigation, useRouter } from 'expo-router';
import {
  getAllTransactions,
  getUnclearedCount,
  type TransactionDisplay,
} from '../../../../src/transactions';
import { useAccountsStore } from '../../../../src/stores/accountsStore';
import { usePrivacyStore } from '../../../../src/stores/privacyStore';
import { useUndoStore } from '../../../../src/stores/undoStore';
import { getCommonMenuItems } from '../../../../src/presentation/hooks/useCommonMenuItems';
import { useTabBarStore } from '../../../../src/stores/tabBarStore';
import { useTheme } from '../../../../src/presentation/providers/ThemeProvider';
import { EmptyState, Text } from '../../../../src/presentation/components';
import { UnclearedPill } from '../../../../src/presentation/components/transaction/UnclearedPill';
import { TransactionRow } from '../../../../src/presentation/components/account/TransactionRow';
import { DateSectionHeader } from '../../../../src/presentation/components/account/DateSectionHeader';
import { AddTransactionButton } from '../../../../src/presentation/components/molecules/AddTransactionButton';
import { useTagsStore } from '../../../../src/stores/tagsStore';
import {
  buildListData,
  useTransactionPagination,
  useTransactionSelection,
  useTransactionBulkActions,
  useSelectModeHeader,
  useBulkCategoryPicker,
  useBulkAccountPicker,
  useTransactionActions,
  type ListItem,
} from '../../../../src/presentation/hooks/transactionList';
import { SelectModeToolbar } from '../../../../src/presentation/components/transaction/SelectModeToolbar';

export default function SpendingScreen() {
  const navigation = useNavigation();
  const router = useRouter();
  const { colors } = useTheme();
  const { accounts, load: loadAccounts } = useAccountsStore();
  const { privacyMode } = usePrivacyStore();
  const canUndo = useUndoStore((s) => s.canUndo);
  const undoVersion = useUndoStore((s) => s.undoVersion);
  const setTabBarHidden = useTabBarStore((s) => s.setHidden);
  const tags = useTagsStore((s) => s.tags);
  const [unclearedCount, setUnclearedCount] = useState(0);

  // ---- Pagination ----
  const fetchTransactions = useCallback(
    (limit: number, offset: number) => getAllTransactions({ limit, offset }),
    [],
  );

  const {
    transactions, setTransactions, loading, loadingMore,
    loadAll, silentRefresh, loadMore, refreshIdRef, hasLoaded, refreshControlProps,
  } = useTransactionPagination({ fetchTransactions });

  // ---- Selection ----
  const {
    selectedIds, isSelectMode, allCleared, selectedTotal,
    handleLongPress, enterSelectMode, handleSelectAll, handleDoneSelection, resetSelection,
  } = useTransactionSelection({
    transactions,
    onEnterSelectMode: () => setTabBarHidden(true),
    onExitSelectMode: () => setTabBarHidden(false),
  });

  // ---- Bulk actions ----
  const otherAccounts = accounts.filter(a => !a.closed);

  const { handleBulkDelete, handleBulkMove, handleBulkToggleCleared, handleBulkChangeCategory, restoreBulkDeleted } = useTransactionBulkActions({
    selectedIds,
    transactions,
    setTransactions,
    refreshIdRef,
    resetSelection,
    loadAccounts,
    optimisticBulkMove: (prev, ids, targetAccountId, targetAccountName) =>
      prev.map(t => ids.has(t.id) ? { ...t, acct: targetAccountId, accountName: targetAccountName } : t),
    onBulkToggleCleared: (_ids, targetVal, affectedTxns) => {
      const delta = affectedTxns.filter(t => !t.cleared).length;
      setUnclearedCount(c => Math.max(0, targetVal ? c - delta : c + delta));
    },
  });

  const { triggerCategoryPicker } = useBulkCategoryPicker(handleBulkChangeCategory);
  const { triggerAccountPicker } = useBulkAccountPicker(handleBulkMove);

  // ---- Select mode header ----
  useSelectModeHeader({
    isSelectMode,
    selectedCount: selectedIds.size,
    selectedTotal,
    onSelectAll: handleSelectAll,
    onDoneSelection: handleDoneSelection,
  });

  // ---- Scroll-driven FAB collapse ----
  const fabCollapsed = useSharedValue(false);
  const handleScroll = useCallback((e: { nativeEvent: { contentOffset: { y: number } } }) => {
    fabCollapsed.value = e.nativeEvent.contentOffset.y > 100;
  }, []);

  // ---- Data loading ----
  useFocusEffect(useCallback(() => {
    if (!hasLoaded.current) {
      loadAll();
      hasLoaded.current = true;
    } else {
      silentRefresh();
    }
    getUnclearedCount().then(setUnclearedCount);
    return () => { resetSelection(); };
  }, [loadAll, silentRefresh, resetSelection]));

  // Refresh local list after undo restores data in DB
  useEffect(() => {
    if (undoVersion > 0) {
      // Defer to avoid "Should not already be working" — undoVersion is set
      // from a queueMicrotask inside the undo store which can overlap with
      // React's commit phase.
      setTimeout(() => {
        restoreDeleted();
        restoreBulkDeleted();
        silentRefresh();
        getUnclearedCount().then(setUnclearedCount);
      }, 0);
    }
  }, [undoVersion]);

  // ---- Single-item handlers ----
  const { handleDelete, handleToggleCleared, handleEditTransaction, handleDuplicate, handleMove, handleSetCategory, handleAddTag, restoreDeleted } =
    useTransactionActions({
      transactions, setTransactions, refreshIdRef, loadAccounts, setUnclearedCount,
      moveMode: 'remap', accounts: otherAccounts,
    });

  // ---- Normal-mode header ----
  useLayoutEffect(() => {
    if (isSelectMode) return;
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
          onPress: enterSelectMode,
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
  }, [isSelectMode, privacyMode, canUndo]);

  // ---- Render ----

  const listData = useMemo(() => buildListData(transactions), [transactions]);

  return (
    <>
      <FlashList<ListItem>
        data={loading ? [] : listData}
        keyExtractor={(item) => item.key}
        getItemType={(item) => item.type}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="automatic"
        ListHeaderComponent={
          !isSelectMode ? (
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
          loadingMore && !loading
            ? <ActivityIndicator color={colors.primary} style={{ paddingVertical: 20 }} />
            : null
        }
        ListEmptyComponent={
          loading
            ? <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
            : <EmptyState
                icon="receipt-outline"
                title="No transactions yet"
                description="Add your first transaction to get started"
              />
        }
        onEndReached={loadMore}
        onEndReachedThreshold={0.3}
        refreshControl={
          <RefreshControl {...refreshControlProps} />
        }
        contentContainerStyle={{ paddingBottom: 80, backgroundColor: colors.pageBackground }}
      />

      {!isSelectMode && (
        <AddTransactionButton collapsed={fabCollapsed} />
      )}

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
