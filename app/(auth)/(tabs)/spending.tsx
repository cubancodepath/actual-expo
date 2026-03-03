import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useFocusEffect, useRouter } from 'expo-router';
import { getAllTransactions, type TransactionDisplay } from '../../../src/transactions';
import { formatDate } from '../../../src/lib/date';
import { formatAmount } from '../../../src/lib/format';

const PAGE_SIZE = 50;

// ---------------------------------------------------------------------------
// Transaction row
// ---------------------------------------------------------------------------

function SpendingRow({
  item,
  onPress,
}: {
  item: TransactionDisplay;
  onPress: (id: string) => void;
}) {
  const statusIcon = item.reconciled ? '🔒' : item.cleared ? '✓' : '○';

  return (
    <Pressable
      style={styles.row}
      onPress={() => onPress(item.id)}
      android_ripple={{ color: '#334155' }}
    >
      <View style={styles.dateCol}>
        <Text style={styles.dateText}>{formatDate(item.date)}</Text>
      </View>

      <View style={styles.midCol}>
        <View style={styles.payeeRow}>
          {item.transferred_id != null && (
            <Text style={styles.transferIcon}>⇄</Text>
          )}
          <Text style={styles.payeeName} numberOfLines={1}>
            {item.payeeName ?? '—'}
          </Text>
        </View>
        <View style={styles.metaRow}>
          {item.accountName ? (
            <Text style={styles.accountBadge} numberOfLines={1}>{item.accountName}</Text>
          ) : null}
          {item.categoryName ? (
            <Text style={styles.categoryText} numberOfLines={1}>{item.categoryName}</Text>
          ) : null}
        </View>
        {item.notes ? (
          <Text style={styles.notesText} numberOfLines={1}>{item.notes}</Text>
        ) : null}
      </View>

      <View style={styles.rightCol}>
        <Text style={[styles.amount, item.amount < 0 ? styles.expense : styles.income]}>
          {formatAmount(item.amount)}
        </Text>
        <Text style={[
          styles.statusIcon,
          item.reconciled ? styles.statusReconciled :
          item.cleared    ? styles.statusCleared    :
                            styles.statusUncleared,
        ]}>
          {statusIcon}
        </Text>
      </View>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function SpendingScreen() {
  const router = useRouter();
  const [transactions, setTransactions] = useState<TransactionDisplay[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [hideReconciled, setHideReconciled] = useState(false);
  const offsetRef = useRef(0);

  const loadInitial = useCallback(async (hide = hideReconciled) => {
    setLoading(true);
    offsetRef.current = 0;
    try {
      const txns = await getAllTransactions({ limit: PAGE_SIZE, offset: 0, hideReconciled: hide });
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

  useFocusEffect(useCallback(() => { loadInitial(); }, []));

  return (
    <View style={styles.container}>
      {/* Toolbar: hide-reconciled toggle */}
      <View style={styles.toolbar}>
        <Text style={styles.toolbarTitle}>
          {transactions.length} transactions
        </Text>
        <Pressable
          style={[styles.toggleBtn, hideReconciled && styles.toggleBtnActive]}
          onPress={() => {
            const next = !hideReconciled;
            setHideReconciled(next);
            loadInitial(next);
          }}
          hitSlop={8}
        >
          <Text style={[styles.toggleIcon, hideReconciled && styles.toggleIconActive]}>🔒</Text>
          <Text style={[styles.toggleLabel, hideReconciled && styles.toggleLabelActive]}>
            {hideReconciled ? 'Hidden' : 'Hide reconciled'}
          </Text>
        </Pressable>
      </View>

      {loading ? (
        <ActivityIndicator color="#3b82f6" style={{ marginTop: 40 }} />
      ) : (
        <FlashList
          data={transactions}
          keyExtractor={t => t.id}
          estimatedItemSize={62}
          renderItem={({ item }) => (
            <SpendingRow
              item={item}
              onPress={id =>
                router.push({ pathname: '/(auth)/transaction/new', params: { transactionId: id } })
              }
            />
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          ListFooterComponent={
            loadingMore
              ? <ActivityIndicator color="#3b82f6" style={{ paddingVertical: 20 }} />
              : null
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>No transactions yet</Text>
            </View>
          }
          contentContainerStyle={{ paddingBottom: 80 }}
        />
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },

  toolbar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: '#1e293b', borderBottomWidth: 1, borderBottomColor: '#334155',
  },
  toolbarTitle: { color: '#64748b', fontSize: 13 },
  toggleBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 8, borderWidth: 1, borderColor: '#334155',
    backgroundColor: '#0f172a',
  },
  toggleBtnActive: { borderColor: '#818cf8', backgroundColor: '#1e1b4b' },
  toggleIcon: { fontSize: 12, opacity: 0.35 },
  toggleIconActive: { opacity: 1 },
  toggleLabel: { color: '#475569', fontSize: 12, fontWeight: '600' },
  toggleLabelActive: { color: '#818cf8' },

  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: '#0f172a',
  },
  dateCol: { width: 46, marginRight: 10 },
  dateText: { color: '#64748b', fontSize: 12, lineHeight: 16 },
  midCol: { flex: 1, marginRight: 10 },
  payeeRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  transferIcon: { color: '#818cf8', fontSize: 12, fontWeight: '700' },
  payeeName: { color: '#f1f5f9', fontSize: 15, fontWeight: '500', flexShrink: 1 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3, flexWrap: 'wrap' },
  accountBadge: {
    color: '#60a5fa', fontSize: 11, fontWeight: '600',
    backgroundColor: '#172554', paddingHorizontal: 6, paddingVertical: 1,
    borderRadius: 4, overflow: 'hidden',
  },
  categoryText: { color: '#64748b', fontSize: 11 },
  notesText: { color: '#475569', fontSize: 11, marginTop: 1, fontStyle: 'italic' },
  rightCol: { alignItems: 'flex-end', minWidth: 76 },
  amount: { fontSize: 14, fontWeight: '600' },
  income: { color: '#4ade80' },
  expense: { color: '#f87171' },
  statusIcon: { fontSize: 11, marginTop: 3 },
  statusReconciled: { color: '#818cf8' },
  statusCleared: { color: '#4ade80' },
  statusUncleared: { color: '#475569' },

  separator: { height: 1, backgroundColor: '#1e293b', marginLeft: 72 },
  empty: { alignItems: 'center', marginTop: 80 },
  emptyText: { color: '#475569', fontSize: 15 },
});
