import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  View,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useAccountsStore } from '../../../src/stores/accountsStore';
import {
  deleteTransaction,
  getClearedBalance,
  getTransactionsForAccount,
  reconcileAccount,
  toggleCleared,
  type TransactionDisplay,
} from '../../../src/transactions';
import { ReconcileOverlay } from '../../../src/presentation/components/account/ReconcileOverlay';
import { useTheme, useThemedStyles } from '../../../src/presentation/providers/ThemeProvider';
import { EmptyState } from '../../../src/presentation/components';
import type { Theme } from '../../../src/theme';

import { BalanceSummary } from '../../../src/presentation/components/account/BalanceSummary';
import { TransactionRow } from '../../../src/presentation/components/account/TransactionRow';
import { DateSectionHeader } from '../../../src/presentation/components/account/DateSectionHeader';
import { AccountHeaderMenu } from '../../../src/presentation/components/account/AccountHeaderMenu';
import { AddTransactionButton } from '../../../src/presentation/components/molecules/AddTransactionButton';

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

  const [transactions, setTransactions] = useState<TransactionDisplay[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [clearedBalance, setClearedBalance] = useState(0);
  const [hideReconciled, setHideReconciled] = useState(false);
  const [showReconcile, setShowReconcile] = useState(false);
  const offsetRef = useRef(0);

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

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    offsetRef.current = 0;
    try {
      const [txns, cleared] = await Promise.all([
        getTransactionsForAccount(id, { limit: PAGE_SIZE, offset: 0, hideReconciled }),
        getClearedBalance(id),
      ]);
      setTransactions(txns);
      setClearedBalance(cleared);
      setHasMore(txns.length === PAGE_SIZE);
      offsetRef.current = txns.length;
      await loadAccounts();
    } finally {
      setRefreshing(false);
    }
  }, [id, loadAccounts, hideReconciled]);

  useFocusEffect(useCallback(() => { loadTransactions(); }, [loadTransactions]));

  async function handleReconcile(bankBalance: number) {
    await reconcileAccount(id, bankBalance);
    await Promise.all([loadAccounts(), loadTransactions()]);
  }

  function handleToggleHideReconciled() {
    const next = !hideReconciled;
    setHideReconciled(next);
    loadTransactions(next);
  }

  useLayoutEffect(() => {
    navigation.setOptions({
      title: account?.name ?? 'Account',
      headerRight: () => (
        <AccountHeaderMenu
          onReconcile={() => setShowReconcile(true)}
          hideReconciled={hideReconciled}
          onToggleHideReconciled={handleToggleHideReconciled}
          onEditAccount={() =>
            router.push({ pathname: '/(auth)/account/settings', params: { id } })
          }
          headerTextColor={colors.headerText}
          isDark={theme.isDark}
        />
      ),
    });
  }, [account?.name, id, colors.headerText, hideReconciled]);

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
      getTransactionsForAccount(id),
      getClearedBalance(id),
    ]);
    setTransactions(txns);
    setClearedBalance(cleared);
    await loadAccounts();
  }

  function handleEditTransaction(txnId: string) {
    router.push({ pathname: '/(auth)/transaction/new', params: { transactionId: txnId } });
  }

  const listData = buildListData(transactions);

  return (
    <View style={styles.container}>
      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlashList<ListItem>
          data={listData}
          keyExtractor={(item) => item.key}
          getItemType={(item) => item.type}
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
                isFirst={item.isFirst}
                isLast={item.isLast}
              />
            );
          }}
          ListHeaderComponent={
            <BalanceSummary
              balance={account?.balance ?? 0}
              clearedBalance={clearedBalance}
            />
          }
          ListFooterComponent={
            loadingMore
              ? <ActivityIndicator color={colors.primary} style={{ paddingVertical: 20 }} />
              : null
          }
          ListEmptyComponent={
            <EmptyState
              icon="receipt-outline"
              title="No transactions yet"
              description="Add your first transaction to get started"
            />
          }
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          contentContainerStyle={{ paddingBottom: 80 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
            />
          }
        />
      )}

      <AddTransactionButton iconOnly accountId={id as string} bottom={28} />

      {/* Reconcile overlay */}
      <ReconcileOverlay
        visible={showReconcile}
        clearedBalance={clearedBalance}
        onReconcile={handleReconcile}
        onClose={() => setShowReconcile(false)}
      />
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
