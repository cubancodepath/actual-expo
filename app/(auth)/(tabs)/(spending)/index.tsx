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
  getSpendingSummary,
  toggleCleared,
  type SpendingSummary,
  type TransactionDisplay,
} from '../../../../src/transactions';
import { useAccountsStore } from '../../../../src/stores/accountsStore';
import { useSpendingStore } from '../../../../src/stores/spendingStore';
import { useTheme, useThemedStyles } from '../../../../src/presentation/providers/ThemeProvider';
import { Divider, EmptyState, Text } from '../../../../src/presentation/components';
import { TransactionRow } from '../../../../src/presentation/components/account/TransactionRow';
import { DateSectionHeader } from '../../../../src/presentation/components/account/DateSectionHeader';
import { AddTransactionButton } from '../../../../src/presentation/components/molecules/AddTransactionButton';
import { SpendingOverviewCard } from '../../../../src/presentation/components/spending/SpendingOverviewCard';
import { CategoryBreakdownRow } from '../../../../src/presentation/components/spending/CategoryBreakdownRow';
import type { Theme } from '../../../../src/theme';

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
      // Mark previous transaction as last in its group
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

  // Mark the very last transaction
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

const SECTION_LABEL_STYLE = {
  textTransform: 'uppercase' as const,
  letterSpacing: 0.8,
  fontWeight: '700' as const,
};

export default function SpendingScreen() {
  const router = useRouter();
  const { colors, spacing } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { load: loadAccounts } = useAccountsStore();
  const { hideReconciled, toggleHideReconciled } = useSpendingStore();

  const [transactions, setTransactions] = useState<TransactionDisplay[]>([]);
  const [summary, setSummary] = useState<SpendingSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const offsetRef = useRef(0);

  const loadAll = useCallback(async () => {
    setLoading(true);
    offsetRef.current = 0;
    try {
      const [txns, sum] = await Promise.all([
        getAllTransactions({ limit: PAGE_SIZE, offset: 0, hideReconciled }),
        getSpendingSummary(),
      ]);
      setTransactions(txns);
      setSummary(sum);
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
      const [txns, sum] = await Promise.all([
        getAllTransactions({ limit: PAGE_SIZE, offset: 0, hideReconciled }),
        getSpendingSummary(),
      ]);
      setTransactions(txns);
      setSummary(sum);
      setHasMore(txns.length === PAGE_SIZE);
      offsetRef.current = txns.length;
    } finally {
      setRefreshing(false);
    }
  }, [hideReconciled]);

  useFocusEffect(useCallback(() => { loadAll(); }, [loadAll]));

  function handleDelete(txnId: string) {
    Alert.alert('Delete Transaction', 'Delete this transaction?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteTransaction(txnId);
          await Promise.all([loadAccounts(), loadAll()]);
        },
      },
    ]);
  }

  async function handleToggleCleared(txnId: string) {
    await toggleCleared(txnId);
    await loadAll();
  }

  function handleEditTransaction(txnId: string) {
    router.push({ pathname: '/(auth)/transaction/new', params: { transactionId: txnId } });
  }

  const listData = buildListData(transactions);
  const topCats = summary?.topCategories ?? [];
  const maxCatTotal = topCats.length > 0
    ? Math.max(...topCats.map(c => Math.abs(c.total)))
    : 0;

  const listHeader = (
    <>
      <Text variant="displayLg" color={colors.textPrimary} style={styles.title}>
        Spending
      </Text>

      {summary && (
        <SpendingOverviewCard
          totalSpent={summary.totalSpent}
          totalIncome={summary.totalIncome}
          transactionCount={summary.transactionCount}
        />
      )}

      {topCats.length > 0 && (
        <>
          <Text
            variant="captionSm"
            color={colors.textMuted}
            style={[SECTION_LABEL_STYLE, styles.sectionLabel]}
          >
            Top Categories
          </Text>
          <View style={styles.categoryCard}>
            {topCats.map((cat, i) => (
              <View key={cat.categoryName}>
                {i > 0 && <Divider />}
                <CategoryBreakdownRow
                  categoryName={cat.categoryName}
                  total={cat.total}
                  maxTotal={maxCatTotal}
                />
              </View>
            ))}
          </View>
        </>
      )}
    </>
  );

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
            ListHeaderComponent={listHeader}
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
                  isFirst={item.isFirst}
                  isLast={item.isLast}
                />
              );
            }}
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
            contentContainerStyle={{ paddingBottom: 80 }}
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
          <Stack.Toolbar.MenuAction
            icon="gearshape"
            onPress={() => router.push('/(auth)/settings')}
          >
            Settings
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
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
  },
  sectionLabel: {
    paddingHorizontal: theme.spacing.lg,
    marginTop: theme.spacing.lg,
    marginBottom: theme.spacing.sm,
  },
  categoryCard: {
    marginHorizontal: theme.spacing.lg,
    backgroundColor: theme.colors.cardBackground,
    borderRadius: theme.borderRadius.lg,
    borderWidth: theme.borderWidth.thin,
    borderColor: theme.colors.cardBorder,
    overflow: 'hidden' as const,
  },
});
