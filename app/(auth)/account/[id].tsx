import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useRefreshControl } from '../../../src/presentation/hooks/useRefreshControl';
import { useSharedValue } from 'react-native-reanimated';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  View,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Stack, useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useAccountsStore } from '../../../src/stores/accountsStore';
import {
  deleteTransaction,
  getClearedBalance,
  getTransactionsForAccount,
  reconcileAccount,
  setClearedBulk,
  toggleCleared,
  updateTransaction,
  type TransactionDisplay,
} from '../../../src/transactions';
import { ReconcileOverlay } from '../../../src/presentation/components/account/ReconcileOverlay';
import { useTheme, useThemedStyles } from '../../../src/presentation/providers/ThemeProvider';
import { EmptyState, Text } from '../../../src/presentation/components';
import { formatBalance } from '../../../src/lib/format';
import type { Theme } from '../../../src/theme';

import { BalanceSummary } from '../../../src/presentation/components/account/BalanceSummary';
import { TransactionRow } from '../../../src/presentation/components/account/TransactionRow';
import { DateSectionHeader } from '../../../src/presentation/components/account/DateSectionHeader';
import { AddTransactionButton } from '../../../src/presentation/components/molecules/AddTransactionButton';
import { usePrefsStore } from '../../../src/stores/prefsStore';

// ---------------------------------------------------------------------------
// Types for mixed FlashList data
// ---------------------------------------------------------------------------

type DateHeader = { type: 'date'; date: number; key: string };
type TransactionItem = {
  type: 'transaction';
  data: TransactionDisplay;
  key: string;
  isFirst: boolean;
  isLast: boolean;
};
type ListItem = DateHeader | TransactionItem;

function buildListData(transactions: TransactionDisplay[]): ListItem[] {
  const items: ListItem[] = [];
  let lastDate: number | null = null;

  for (let i = 0; i < transactions.length; i++) {
    const txn = transactions[i];
    const isNewDate = txn.date !== lastDate;
    if (isNewDate) {
      if (items.length > 0) {
        const prev = items[items.length - 1];
        if (prev.type === 'transaction') prev.isLast = true;
      }
      items.push({ type: 'date', date: txn.date, key: `date-${txn.date}` });
      lastDate = txn.date;
    }
    items.push({
      type: 'transaction',
      data: txn,
      key: txn.id,
      isFirst: isNewDate,
      isLast: false,
    });
  }

  if (items.length > 0) {
    const last = items[items.length - 1];
    if (last.type === 'transaction') last.isLast = true;
  }

  return items;
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

const PAGE_SIZE = 50;

export default function AccountTransactionsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();
  const router = useRouter();
  const theme = useTheme();
  const { colors } = theme;
  const styles = useThemedStyles(createScreenStyles);
  const { accounts, load: loadAccounts } = useAccountsStore();
  const account = accounts.find(a => a.id === id);
  const otherAccounts = accounts.filter(a => a.id !== id && !a.closed);

  const [transactions, setTransactions] = useState<TransactionDisplay[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [clearedBalance, setClearedBalance] = useState(0);
  const { hideReconciled, toggleHideReconciled } = usePrefsStore();
  const [showReconcile, setShowReconcile] = useState(false);
  const offsetRef = useRef(0);

  // ---- Selection state ----
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isSelectMode, setIsSelectMode] = useState(false);

  const selectedTransactions = useMemo(
    () => transactions.filter(t => selectedIds.has(t.id)),
    [selectedIds, transactions],
  );

  const allCleared = useMemo(() => {
    const nonReconciled = selectedTransactions.filter(t => !t.reconciled);
    return nonReconciled.length > 0 && nonReconciled.every(t => t.cleared);
  }, [selectedTransactions]);

  const selectedTotal = useMemo(
    () => selectedTransactions.reduce((sum, t) => sum + t.amount, 0),
    [selectedTransactions],
  );

  // ---- Scroll-driven FAB collapse ----
  const fabCollapsed = useSharedValue(false);
  const COLLAPSE_THRESHOLD = 100;
  const handleScroll = useCallback((e: { nativeEvent: { contentOffset: { y: number } } }) => {
    fabCollapsed.value = e.nativeEvent.contentOffset.y > COLLAPSE_THRESHOLD;
  }, []);

  // ---- Data loading ----

  const loadTransactions = useCallback(async (hide = hideReconciled) => {
    setLoading(true);
    offsetRef.current = 0;
    try {
      const [txns, cleared] = await Promise.all([
        getTransactionsForAccount(id, { limit: PAGE_SIZE, offset: 0, hideReconciled: hide }),
        getClearedBalance(id),
      ]);
      setTransactions(txns);
      setClearedBalance(cleared);
      setHasMore(txns.length === PAGE_SIZE);
      offsetRef.current = txns.length;
    } finally {
      setLoading(false);
    }
  }, [id, hideReconciled]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const txns = await getTransactionsForAccount(id, { limit: PAGE_SIZE, offset: offsetRef.current, hideReconciled });
      if (txns.length === 0) { setHasMore(false); return; }
      setTransactions(prev => [...prev, ...txns]);
      setHasMore(txns.length === PAGE_SIZE);
      offsetRef.current += txns.length;
    } finally {
      setLoadingMore(false);
    }
  }, [id, loadingMore, hasMore, hideReconciled]);

  const { refreshControlProps } = useRefreshControl({
    onRefresh: async () => {
      offsetRef.current = 0;
      const [txns, cleared] = await Promise.all([
        getTransactionsForAccount(id, { limit: PAGE_SIZE, offset: 0, hideReconciled }),
        getClearedBalance(id),
      ]);
      setTransactions(txns);
      setClearedBalance(cleared);
      setHasMore(txns.length === PAGE_SIZE);
      offsetRef.current = txns.length;
    },
  });

  useFocusEffect(useCallback(() => {
    loadTransactions();
    return () => { setIsSelectMode(false); setSelectedIds(new Set()); };
  }, [loadTransactions]));

  // ---- Single-item handlers ----

  async function handleReconcile(bankBalance: number) {
    await reconcileAccount(id, bankBalance);
    await Promise.all([loadAccounts(), loadTransactions()]);
  }

  function handleToggleHideReconciled() {
    const next = !hideReconciled;
    toggleHideReconciled();
    loadTransactions(next);
  }

  function handleDelete(txnId: string) {
    Alert.alert('Delete Transaction', 'Delete this transaction?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteTransaction(txnId);
          await Promise.all([loadAccounts(), loadTransactions()]);
        },
      },
    ]);
  }

  async function handleToggleCleared(txnId: string) {
    await toggleCleared(txnId);
    const [txns, cleared] = await Promise.all([
      getTransactionsForAccount(id, { limit: offsetRef.current || PAGE_SIZE, offset: 0, hideReconciled }),
      getClearedBalance(id),
    ]);
    setTransactions(txns);
    setClearedBalance(cleared);
    await loadAccounts();
  }

  function handleEditTransaction(txnId: string) {
    router.push({ pathname: '/(auth)/transaction/new', params: { transactionId: txnId } });
  }

  // ---- Selection handlers ----

  function handleLongPress(txnId: string) {
    if (!isSelectMode) {
      setIsSelectMode(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(txnId)) next.delete(txnId);
      else next.add(txnId);
      return next;
    });
  }

  function enterSelectMode() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsSelectMode(true);
  }

  function handleSelectAll() {
    const allIds = transactions.filter(t => !t.reconciled).map(t => t.id);
    setSelectedIds(new Set(allIds));
  }

  function handleDoneSelection() {
    setIsSelectMode(false);
    setSelectedIds(new Set());
  }

  function handleBulkDelete() {
    const count = selectedIds.size;
    Alert.alert(
      'Delete Transactions',
      `Delete ${count} transaction${count === 1 ? '' : 's'}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            for (const txnId of selectedIds) {
              await deleteTransaction(txnId);
            }
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            setIsSelectMode(false);
            setSelectedIds(new Set());
            await Promise.all([loadAccounts(), loadTransactions()]);
          },
        },
      ],
    );
  }

  async function handleBulkMove(targetAccountId: string) {
    const count = selectedIds.size;
    const targetAccount = accounts.find(a => a.id === targetAccountId);
    Alert.alert(
      'Move Transactions',
      `Move ${count} transaction${count === 1 ? '' : 's'} to ${targetAccount?.name ?? 'account'}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Move',
          onPress: async () => {
            for (const txnId of selectedIds) {
              await updateTransaction(txnId, { acct: targetAccountId });
            }
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            setIsSelectMode(false);
            setSelectedIds(new Set());
            await Promise.all([loadAccounts(), loadTransactions()]);
          },
        },
      ],
    );
  }

  async function handleBulkToggleCleared() {
    const selected = transactions.filter(t => selectedIds.has(t.id) && !t.reconciled);
    if (selected.length === 0) return;

    const anyUncleared = selected.some(t => !t.cleared);
    const updated = await setClearedBulk(selected.map(t => t.id), anyUncleared);

    if (updated > 0) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }

    const [txns, cleared] = await Promise.all([
      getTransactionsForAccount(id, { limit: offsetRef.current || PAGE_SIZE, offset: 0, hideReconciled }),
      getClearedBalance(id),
    ]);
    setTransactions(txns);
    setClearedBalance(cleared);
    setIsSelectMode(false);
    setSelectedIds(new Set());
    await loadAccounts();
  }

  // ---- Header ----

  useLayoutEffect(() => {
    if (isSelectMode) {
      navigation.setOptions({
        title: selectedIds.size > 0
          ? `${selectedIds.size} Selected`
          : 'Select Items',
        headerTitle: selectedIds.size > 0
          ? () => (
              <View style={{ alignItems: 'center' }}>
                <Text variant="body" style={{ fontWeight: '600' }}>{selectedIds.size} Selected</Text>
                <Text variant="captionSm" color={colors.textMuted}>{formatBalance(selectedTotal)}</Text>
              </View>
            )
          : undefined,
        headerRight: undefined,
        unstable_headerRightItems: () => [
          {
            type: 'button' as const,
            icon: { type: 'sfSymbol' as const, name: 'xmark' },
            onPress: handleDoneSelection,
          },
        ],
        headerLeft: () => (
          <Pressable onPress={handleSelectAll} hitSlop={8} style={{ paddingHorizontal: 8 }}>
            <Text variant="body" color={colors.headerText} style={{ fontWeight: '600' }}>
              Select All
            </Text>
          </Pressable>
        ),
      });
    } else {
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
    }
  }, [account?.name, id, colors.headerText, hideReconciled, isSelectMode, selectedIds.size, selectedTotal]);

  // ---- Render ----

  const listData = useMemo(() => buildListData(transactions), [transactions]);

  return (
    <View style={styles.container}>
      {/* Sticky balance header — always visible above the list */}
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
        onReconcile={handleReconcile}
        onClose={() => setShowReconcile(false)}
      />

      {!isSelectMode && (
        <AddTransactionButton accountId={id as string} bottom={28} collapsed={fabCollapsed} />
      )}

      {/* Native bottom toolbar for selection actions */}
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
                    onPress={() => handleBulkMove(acc.id)}
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

// ---------------------------------------------------------------------------
// Screen styles
// ---------------------------------------------------------------------------

const createScreenStyles = (theme: Theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.pageBackground,
  },
});
