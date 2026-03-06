import { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import { useSharedValue } from 'react-native-reanimated';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  View,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Stack, useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useAccountsStore } from '../../../src/stores/accountsStore';
import {
  deleteTransaction,
  duplicateTransaction,
  getClearedBalance,
  getTransactionsForAccount,
  lockTransactions,
  reconcileAccount,
  toggleCleared,
  updateTransaction,
  type TransactionDisplay,
} from '../../../src/transactions';
import { ReconcileOverlay } from '../../../src/presentation/components/account/ReconcileOverlay';
import { useTheme, useThemedStyles } from '../../../src/presentation/providers/ThemeProvider';
import { EmptyState } from '../../../src/presentation/components';
import type { Theme } from '../../../src/theme';

import { BalanceSummary } from '../../../src/presentation/components/account/BalanceSummary';
import { TransactionRow } from '../../../src/presentation/components/account/TransactionRow';
import { DateSectionHeader } from '../../../src/presentation/components/account/DateSectionHeader';
import { AddTransactionButton } from '../../../src/presentation/components/molecules/AddTransactionButton';
import { usePrefsStore } from '../../../src/stores/prefsStore';
import { useTagsStore } from '../../../src/stores/tagsStore';
import {
  buildListData,
  useTransactionPagination,
  useTransactionSelection,
  useTransactionBulkActions,
  useSelectModeHeader,
  type ListItem,
} from '../../../src/presentation/hooks/transactionList';

export default function AccountTransactionsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useThemedStyles(createScreenStyles);
  const { accounts, load: loadAccounts } = useAccountsStore();
  const account = accounts.find(a => a.id === id);
  const otherAccounts = accounts.filter(a => a.id !== id && !a.closed);

  const [clearedBalance, setClearedBalance] = useState(0);
  const { hideReconciled, toggleHideReconciled } = usePrefsStore();
  const tags = useTagsStore((s) => s.tags);
  const [showReconcile, setShowReconcile] = useState(false);

  // ---- Pagination ----
  const fetchTransactions = useCallback(
    (limit: number, offset: number) => {
      // Read hideReconciled from store at call time (not closure time)
      const hide = usePrefsStore.getState().hideReconciled;
      return getTransactionsForAccount(id, { limit, offset, hideReconciled: hide });
    },
    [id],
  );

  const {
    transactions, setTransactions, loading, loadingMore,
    loadAll, silentRefresh, loadMore, refreshIdRef, hasLoaded, refreshControlProps,
  } = useTransactionPagination({ fetchTransactions });

  // Load cleared balance alongside transactions
  const loadWithClearedBalance = useCallback(async () => {
    const [, cleared] = await Promise.all([loadAll(), getClearedBalance(id)]);
    setClearedBalance(cleared);
  }, [loadAll, id]);

  const silentRefreshWithBalance = useCallback(async () => {
    const [, cleared] = await Promise.all([silentRefresh(), getClearedBalance(id)]);
    setClearedBalance(cleared);
  }, [silentRefresh, id]);

  // ---- Selection ----
  const {
    selectedIds, isSelectMode, allCleared, selectedTotal,
    handleLongPress, enterSelectMode, handleSelectAll, handleDoneSelection, resetSelection,
  } = useTransactionSelection({ transactions });

  // ---- Bulk actions ----
  const { handleBulkDelete, handleBulkMove, handleBulkToggleCleared } = useTransactionBulkActions({
    selectedIds,
    transactions,
    setTransactions,
    refreshIdRef,
    resetSelection,
    loadAccounts,
    onBulkToggleCleared: (_ids, targetVal, affectedTxns) => {
      let balanceDelta = 0;
      for (const t of affectedTxns) {
        balanceDelta += t.cleared ? -t.amount : t.amount;
      }
      setClearedBalance(prev => prev + balanceDelta);
    },
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
      loadWithClearedBalance();
      hasLoaded.current = true;
    } else {
      silentRefreshWithBalance();
    }
    return () => { resetSelection(); };
  }, [loadWithClearedBalance, silentRefreshWithBalance, resetSelection]));

  // ---- Account-specific handlers ----

  async function handleConfirmMatch() {
    await lockTransactions(id);
    await Promise.all([loadAccounts(), loadAll()]);
    setClearedBalance(await getClearedBalance(id));
  }

  async function handleReconcile(bankBalance: number) {
    await reconcileAccount(id, bankBalance);
    await Promise.all([loadAccounts(), loadAll()]);
    setClearedBalance(await getClearedBalance(id));
  }

  function handleToggleHideReconciled() {
    toggleHideReconciled();
    loadWithClearedBalance();
  }

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
    const txn = transactions.find(t => t.id === txnId);
    if (txn && !txn.reconciled) {
      const delta = txn.cleared ? -txn.amount : txn.amount;
      setTransactions(prev => prev.map(t =>
        t.id === txnId ? { ...t, cleared: !t.cleared } : t
      ));
      setClearedBalance(prev => prev + delta);
    }
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
    setTransactions(prev => prev.filter(t => t.id !== txnId));
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
          onPress: enterSelectMode,
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
                onPress: () => setShowReconcile(true),
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
            ],
          },
        },
      ],
    });
  }, [account?.name, id, isSelectMode, hideReconciled]);

  // ---- Render ----

  const listData = useMemo(() => buildListData(transactions), [transactions]);

  return (
    <View style={styles.container}>
      <BalanceSummary
        balance={account?.balance ?? 0}
        clearedBalance={clearedBalance}
      />

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlashList<ListItem>
          data={listData}
          keyExtractor={(item) => item.key}
          getItemType={(item) => item.type}
          onScroll={handleScroll}
          scrollEventThrottle={16}
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
            loadingMore
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
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          contentContainerStyle={{ paddingBottom: 80 }}
          refreshControl={
            <RefreshControl {...refreshControlProps} />
          }
        />
      )}

      <ReconcileOverlay
        visible={showReconcile}
        clearedBalance={clearedBalance}
        onConfirmMatch={handleConfirmMatch}
        onReconcile={handleReconcile}
        onClose={() => setShowReconcile(false)}
      />

      {!isSelectMode && (
        <AddTransactionButton accountId={id as string} bottom={28} collapsed={fabCollapsed} />
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
    </View>
  );
}

const createScreenStyles = (theme: Theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.pageBackground,
  },
});
