import { useCallback, useLayoutEffect, useMemo } from 'react';
import { useSharedValue } from 'react-native-reanimated';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  View,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Stack, useFocusEffect, useNavigation, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import {
  deleteTransaction,
  duplicateTransaction,
  getAllTransactions,
  toggleCleared,
  updateTransaction,
  type TransactionDisplay,
} from '../../../../src/transactions';
import { useAccountsStore } from '../../../../src/stores/accountsStore';
import { usePrivacyStore } from '../../../../src/stores/privacyStore';
import { useTabBarStore } from '../../../../src/stores/tabBarStore';
import { useTheme } from '../../../../src/presentation/providers/ThemeProvider';
import { EmptyState } from '../../../../src/presentation/components';
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
  type ListItem,
} from '../../../../src/presentation/hooks/transactionList';

export default function SpendingScreen() {
  const navigation = useNavigation();
  const router = useRouter();
  const { colors } = useTheme();
  const { accounts, load: loadAccounts } = useAccountsStore();
  const { privacyMode, toggle: togglePrivacy } = usePrivacyStore();
  const setTabBarHidden = useTabBarStore((s) => s.setHidden);
  const tags = useTagsStore((s) => s.tags);

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

  const { handleBulkDelete, handleBulkMove, handleBulkToggleCleared } = useTransactionBulkActions({
    selectedIds,
    transactions,
    setTransactions,
    refreshIdRef,
    resetSelection,
    loadAccounts,
    optimisticBulkMove: (prev, ids, targetAccountId, targetAccountName) =>
      prev.map(t => ids.has(t.id) ? { ...t, acct: targetAccountId, accountName: targetAccountName } : t),
  });

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
    return () => { resetSelection(); };
  }, [loadAll, silentRefresh, resetSelection]));

  // ---- Single-item handlers ----

  function handleDelete(txnId: string) {
    Alert.alert('Delete Transaction', 'Delete this transaction?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          refreshIdRef.current++;
          setTransactions(prev => prev.filter(t => t.id !== txnId));
          await deleteTransaction(txnId);
          loadAccounts();
        },
      },
    ]);
  }

  async function handleToggleCleared(txnId: string) {
    refreshIdRef.current++;
    setTransactions(prev => prev.map(t =>
      t.id === txnId ? { ...t, cleared: !t.cleared } : t
    ));
    await toggleCleared(txnId);
  }

  function handleEditTransaction(txnId: string) {
    router.push({ pathname: '/(auth)/transaction/new', params: { transactionId: txnId } });
  }

  async function handleDuplicate(txnId: string) {
    refreshIdRef.current++;
    const original = transactions.find(t => t.id === txnId);
    if (!original) return;
    const newId = await duplicateTransaction(txnId);
    if (newId) {
      const clone: TransactionDisplay = { ...original, id: newId, cleared: false, reconciled: false };
      setTransactions(prev => {
        const idx = prev.findIndex(t => t.id === txnId);
        const next = [...prev];
        next.splice(idx + 1, 0, clone);
        return next;
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    loadAccounts();
  }

  async function handleMove(txnId: string, targetAccountId: string) {
    refreshIdRef.current++;
    const targetName = accounts.find(a => a.id === targetAccountId)?.name;
    setTransactions(prev => prev.map(t =>
      t.id === txnId ? { ...t, acct: targetAccountId, accountName: targetName } : t
    ));
    await updateTransaction(txnId, { acct: targetAccountId });
    loadAccounts();
  }

  function handleAddTag(txnId: string) {
    router.push({ pathname: '/(auth)/transaction/tags', params: { transactionId: txnId, mode: 'direct' } });
  }

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
            items: [
              {
                type: 'action' as const,
                label: privacyMode ? 'Show Amounts' : 'Hide Amounts',
                icon: { type: 'sfSymbol' as const, name: privacyMode ? 'eye' : 'eye.slash' },
                onPress: togglePrivacy,
              },
              {
                type: 'action' as const,
                label: 'Settings',
                icon: { type: 'sfSymbol' as const, name: 'gearshape' },
                onPress: () => router.push('/(auth)/settings'),
              },
            ],
          },
        },
      ],
    });
  }, [isSelectMode, privacyMode]);

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
            <Stack.Screen.Title large>Spending</Stack.Screen.Title>
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
              onAddTag={handleAddTag}
              showAccountName
              tags={tags}
              moveAccounts={otherAccounts}
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
        <Stack.Toolbar>
          <Stack.Toolbar.Button
            icon={allCleared ? 'circle' : 'checkmark.circle'}
            onPress={handleBulkToggleCleared}
          >
            {allCleared ? 'Unclear' : 'Clear'}
          </Stack.Toolbar.Button>
          <Stack.Toolbar.Spacer />
          <Stack.Toolbar.Menu icon="ellipsis">
            {otherAccounts.length > 0 && (
              <Stack.Toolbar.Menu icon="arrow.right.arrow.left" title="Move to...">
                {otherAccounts.map(acc => (
                  <Stack.Toolbar.MenuAction
                    key={acc.id}
                    onPress={() => handleBulkMove(acc.id, acc.name)}
                  >
                    {acc.name}
                  </Stack.Toolbar.MenuAction>
                ))}
              </Stack.Toolbar.Menu>
            )}
            <Stack.Toolbar.MenuAction
              icon="trash"
              destructive
              onPress={handleBulkDelete}
            >
              Delete
            </Stack.Toolbar.MenuAction>
          </Stack.Toolbar.Menu>
        </Stack.Toolbar>
      )}
    </>
  );
}
