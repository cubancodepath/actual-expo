import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { useSharedValue } from 'react-native-reanimated';
import {
  ActivityIndicator,
  RefreshControl,
  View,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useAccountsStore } from '../../../src/stores/accountsStore';
import {
  getClearedBalance,
  getTransactionsForAccount,
  getUnclearedCount,
  lockTransactions,
  reconcileAccount,
} from '../../../src/transactions';
import { ReconcileOverlay } from '../../../src/presentation/components/account/ReconcileOverlay';
import { useTheme, useThemedStyles } from '../../../src/presentation/providers/ThemeProvider';
import { EmptyState } from '../../../src/presentation/components';
import type { Theme } from '../../../src/theme';

import { BalanceSummary } from '../../../src/presentation/components/account/BalanceSummary';
import { TransactionRow } from '../../../src/presentation/components/account/TransactionRow';
import { DateSectionHeader } from '../../../src/presentation/components/account/DateSectionHeader';
import { AddTransactionButton } from '../../../src/presentation/components/molecules/AddTransactionButton';
import { UnclearedPill } from '../../../src/presentation/components/transaction/UnclearedPill';
import { usePrefsStore } from '../../../src/stores/prefsStore';
import { usePrivacyStore } from '../../../src/stores/privacyStore';
import { useUndoStore } from '../../../src/stores/undoStore';
import { getCommonMenuItems } from '../../../src/presentation/hooks/useCommonMenuItems';
import { useTagsStore } from '../../../src/stores/tagsStore';
import {
  useSelectModeHeader,
  useTransactionList,
  type ListItem,
} from '../../../src/presentation/hooks/transactionList';
import { SelectModeToolbar } from '../../../src/presentation/components/transaction/SelectModeToolbar';

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
  const [showReconcile, setShowReconcile] = useState(false);

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

  // Load cleared balance + uncleared count alongside transactions
  const loadWithClearedBalance = useCallback(async () => {
    const [, cleared, uncleared] = await Promise.all([txnList.loadAll(), getClearedBalance(id), getUnclearedCount(id)]);
    setClearedBalance(cleared);
    setUnclearedCount(uncleared);
  }, [txnList.loadAll, id]);

  const silentRefreshWithBalance = useCallback(async () => {
    const [, cleared, uncleared] = await Promise.all([txnList.silentRefresh(), getClearedBalance(id), getUnclearedCount(id)]);
    setClearedBalance(cleared);
    setUnclearedCount(uncleared);
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

  async function handleConfirmMatch() {
    await lockTransactions(id);
    await Promise.all([loadAccounts(), txnList.loadAll()]);
    setClearedBalance(await getClearedBalance(id));
  }

  async function handleReconcile(bankBalance: number) {
    await reconcileAccount(id, bankBalance);
    await Promise.all([loadAccounts(), txnList.loadAll()]);
    setClearedBalance(await getClearedBalance(id));
  }

  function handleToggleHideReconciled() {
    toggleHideReconciled();
    loadWithClearedBalance();
  }

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
              ...getCommonMenuItems(router),
            ],
          },
        },
      ],
    });
  }, [account?.name, id, txnList.isSelectMode, hideReconciled, privacyMode, canUndo]);

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
          data={txnList.listData}
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

      <ReconcileOverlay
        visible={showReconcile}
        clearedBalance={clearedBalance}
        onConfirmMatch={handleConfirmMatch}
        onReconcile={handleReconcile}
        onClose={() => setShowReconcile(false)}
      />

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
