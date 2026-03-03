import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  View,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import {
  deleteTransaction,
  getAllTransactions,
  toggleCleared,
  type TransactionDisplay,
} from '../../../../src/transactions';
import { useAccountsStore } from '../../../../src/stores/accountsStore';
import { useSpendingStore } from '../../../../src/stores/spendingStore';
import { useTheme, useThemedStyles } from '../../../../src/presentation/providers/ThemeProvider';
import { EmptyState, Text } from '../../../../src/presentation/components';
import { TransactionRow } from '../../../../src/presentation/components/account/TransactionRow';
import { DateSectionHeader } from '../../../../src/presentation/components/account/DateSectionHeader';
import { AddTransactionButton } from '../../../../src/presentation/components/molecules/AddTransactionButton';
import type { Theme } from '../../../../src/theme';

// ---------------------------------------------------------------------------
// Types for mixed FlashList data
// ---------------------------------------------------------------------------

type DateHeader = { type: 'date'; date: number; key: string };
type TransactionItem = { type: 'transaction'; data: TransactionDisplay; key: string };
type ListItem = DateHeader | TransactionItem;

function buildListData(transactions: TransactionDisplay[]): ListItem[] {
  const items: ListItem[] = [];
  let lastDate: number | null = null;

  for (const txn of transactions) {
    if (txn.date !== lastDate) {
      items.push({ type: 'date', date: txn.date, key: `date-${txn.date}` });
      lastDate = txn.date;
    }
    items.push({ type: 'transaction', data: txn, key: txn.id });
  }

  return items;
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

const PAGE_SIZE = 50;

export default function SpendingScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { load: loadAccounts } = useAccountsStore();
  const { hideReconciled, toggleHideReconciled } = useSpendingStore();

  const [transactions, setTransactions] = useState<TransactionDisplay[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const offsetRef = useRef(0);

  const loadInitial = useCallback(async () => {
    setLoading(true);
    offsetRef.current = 0;
    try {
      const txns = await getAllTransactions({ limit: PAGE_SIZE, offset: 0, hideReconciled });
      setTransactions(txns);
      setHasMore(txns.length === PAGE_SIZE);
      offsetRef.current = txns.length;
    } finally {
      setLoading(false);
    }
  }, [hideReconciled]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const txns = await getAllTransactions({ limit: PAGE_SIZE, offset: offsetRef.current, hideReconciled });
      if (txns.length === 0) { setHasMore(false); return; }
      setTransactions(prev => [...prev, ...txns]);
      setHasMore(txns.length === PAGE_SIZE);
      offsetRef.current += txns.length;
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, hideReconciled]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    offsetRef.current = 0;
    try {
      const txns = await getAllTransactions({ limit: PAGE_SIZE, offset: 0, hideReconciled });
      setTransactions(txns);
      setHasMore(txns.length === PAGE_SIZE);
      offsetRef.current = txns.length;
    } finally {
      setRefreshing(false);
    }
  }, [hideReconciled]);

  useFocusEffect(useCallback(() => { loadInitial(); }, [loadInitial]));

  function handleDelete(txnId: string) {
    Alert.alert('Delete Transaction', 'Delete this transaction?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteTransaction(txnId);
          await Promise.all([loadAccounts(), loadInitial()]);
        },
      },
    ]);
  }

  async function handleToggleCleared(txnId: string) {
    await toggleCleared(txnId);
    await loadInitial();
  }

  function handleEditTransaction(txnId: string) {
    router.push({ pathname: '/(auth)/transaction/new', params: { transactionId: txnId } });
  }

  const listData = buildListData(transactions);

  return (
    <>
      <View style={styles.container}>
        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
        ) : (
          <FlashList<ListItem>
            data={listData}
            keyExtractor={(item) => item.key}
            getItemType={(item) => item.type}
            ListHeaderComponent={
              <Text variant="displayLg" color={colors.textPrimary} style={styles.title}>
                Spending
              </Text>
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
                  showAccountName
                />
              );
            }}
            ItemSeparatorComponent={() => (
              <View style={{ height: 1, backgroundColor: colors.divider }} />
            )}
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
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={colors.primary}
              />
            }
          />
        )}
        <AddTransactionButton />
      </View>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Menu icon="ellipsis">
          <Stack.Toolbar.MenuAction
            icon={hideReconciled ? 'eye' : 'eye.slash'}
            onPress={toggleHideReconciled}
          >
            {hideReconciled ? 'Show Reconciled' : 'Hide Reconciled'}
          </Stack.Toolbar.MenuAction>
        </Stack.Toolbar.Menu>
      </Stack.Toolbar>
    </>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const createStyles = (theme: Theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.pageBackground,
  },
  title: {
    fontWeight: '700' as const,
    marginBottom: theme.spacing.xl,
    marginTop: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
  },
});
