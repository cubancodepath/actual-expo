import { useCallback, useLayoutEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useAccountsStore } from '../../../src/stores/accountsStore';
import {
  deleteTransaction,
  getTransactionsForAccount,
  type TransactionDisplay,
} from '../../../src/transactions';

function formatDate(date: number): string {
  const s = String(date);
  const d = new Date(
    parseInt(s.slice(0, 4)),
    parseInt(s.slice(4, 6)) - 1,
    parseInt(s.slice(6, 8)),
  );
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatAmount(cents: number): string {
  const abs = (Math.abs(cents) / 100).toFixed(2);
  return cents < 0 ? `-$${abs}` : `+$${abs}`;
}

function formatBalance(cents: number): string {
  const abs = (Math.abs(cents) / 100).toFixed(2);
  return cents < 0 ? `-$${abs}` : `$${abs}`;
}

function TransactionRow({
  item,
  onDelete,
}: {
  item: TransactionDisplay;
  onDelete: (id: string) => void;
}) {
  return (
    <Pressable
      style={styles.txRow}
      onLongPress={() => onDelete(item.id)}
      android_ripple={{ color: '#334155' }}
    >
      <View style={styles.txDate}>
        <Text style={styles.txDateText}>{formatDate(item.date)}</Text>
      </View>
      <View style={styles.txMid}>
        <View style={styles.txPayeeRow}>
          {item.transferred_id != null && (
            <Text style={styles.txTransferIcon}>⇄</Text>
          )}
          <Text style={styles.txPayee} numberOfLines={1}>
            {item.payeeName ?? '—'}
          </Text>
        </View>
        {item.categoryName ? (
          <Text style={styles.txCategory} numberOfLines={1}>
            {item.categoryName}
          </Text>
        ) : null}
        {item.notes ? (
          <Text style={styles.txNotes} numberOfLines={1}>
            {item.notes}
          </Text>
        ) : null}
      </View>
      <View style={styles.txRight}>
        <Text style={[styles.txAmount, item.amount < 0 ? styles.expense : styles.income]}>
          {formatAmount(item.amount)}
        </Text>
        {item.cleared && <Text style={styles.clearedDot}>✓</Text>}
      </View>
    </Pressable>
  );
}

export default function AccountTransactionsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();
  const router = useRouter();
  const { accounts, load: loadAccounts } = useAccountsStore();
  const account = accounts.find(a => a.id === id);

  const [transactions, setTransactions] = useState<TransactionDisplay[]>([]);
  const [loading, setLoading] = useState(true);

  const loadTransactions = useCallback(async () => {
    setLoading(true);
    try {
      setTransactions(await getTransactionsForAccount(id));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(useCallback(() => { loadTransactions(); }, [loadTransactions]));

  useLayoutEffect(() => {
    navigation.setOptions({
      title: account?.name ?? 'Account',
      headerRight: () => (
        <Pressable
          onPress={() =>
            router.push({ pathname: '/(auth)/account/settings', params: { id } })
          }
          hitSlop={12}
          style={{ paddingHorizontal: 4 }}
        >
          <Text style={styles.settingsIcon}>⚙</Text>
        </Pressable>
      ),
    });
  }, [account?.name, id]);

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

  return (
    <View style={styles.container}>
      {/* Balance card */}
      <View style={styles.balanceCard}>
        <Text style={styles.balanceLabel}>Current Balance</Text>
        <Text style={[styles.balance, (account?.balance ?? 0) < 0 && styles.negative]}>
          {formatBalance(account?.balance ?? 0)}
        </Text>
      </View>

      {loading ? (
        <ActivityIndicator color="#3b82f6" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={transactions}
          keyExtractor={t => t.id}
          renderItem={({ item }) => (
            <TransactionRow item={item} onDelete={handleDelete} />
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>No transactions yet</Text>
              <Text style={styles.emptyHint}>Tap + to add one</Text>
            </View>
          }
          contentContainerStyle={{ paddingBottom: 100 }}
        />
      )}

      {/* FAB */}
      <Pressable
        style={styles.fab}
        onPress={() =>
          router.push({ pathname: '/(auth)/transaction/new', params: { accountId: id } })
        }
      >
        <Text style={styles.fabText}>+</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },

  balanceCard: {
    backgroundColor: '#1e293b', marginHorizontal: 16, marginTop: 12,
    marginBottom: 8, borderRadius: 12, padding: 16,
    borderWidth: 1, borderColor: '#334155',
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  balanceLabel: { color: '#64748b', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  balance: { color: '#4ade80', fontSize: 22, fontWeight: '700' },
  negative: { color: '#f87171' },

  settingsIcon: { color: '#94a3b8', fontSize: 20 },

  txRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: '#0f172a',
  },
  txDate: { width: 44, marginRight: 12 },
  txDateText: { color: '#64748b', fontSize: 12, lineHeight: 16 },
  txMid: { flex: 1, marginRight: 12 },
  txPayeeRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  txTransferIcon: { color: '#818cf8', fontSize: 13, fontWeight: '700' },
  txPayee: { color: '#f1f5f9', fontSize: 15, fontWeight: '500', flexShrink: 1 },
  txCategory: { color: '#64748b', fontSize: 12, marginTop: 2 },
  txNotes: { color: '#475569', fontSize: 12, marginTop: 1, fontStyle: 'italic' },
  txRight: { alignItems: 'flex-end', minWidth: 72 },
  txAmount: { fontSize: 15, fontWeight: '600' },
  income: { color: '#4ade80' },
  expense: { color: '#f87171' },
  clearedDot: { color: '#4ade80', fontSize: 10, marginTop: 2 },

  separator: { height: 1, backgroundColor: '#1e293b', marginLeft: 16 },

  empty: { alignItems: 'center', marginTop: 80, gap: 8 },
  emptyText: { color: '#94a3b8', fontSize: 16, fontWeight: '600' },
  emptyHint: { color: '#475569', fontSize: 13 },

  fab: {
    position: 'absolute', bottom: 28, right: 24,
    backgroundColor: '#3b82f6', width: 56, height: 56,
    borderRadius: 28, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 8,
  },
  fabText: { color: '#fff', fontSize: 28, lineHeight: 32, fontWeight: '300' },
});
