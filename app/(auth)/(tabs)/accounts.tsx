import { useEffect } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAccountsStore } from '../../../src/stores/accountsStore';
import { useSyncStore } from '../../../src/stores/syncStore';

function formatBalance(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  return `${sign}$${(Math.abs(cents) / 100).toFixed(2)}`;
}

export default function AccountsScreen() {
  const router = useRouter();
  const { accounts, loading, load } = useAccountsStore();
  const { refreshing, sync } = useSyncStore();

  useEffect(() => { load(); }, []);

  const budget = accounts.filter(a => !a.offbudget && !a.closed);
  const offBudget = accounts.filter(a => a.offbudget && !a.closed);

  type ListItem =
    | { type: 'header'; label: string }
    | { type: 'account'; data: typeof accounts[0] };

  const items: ListItem[] = [
    ...(budget.length > 0 ? [{ type: 'header' as const, label: 'Budget Accounts' }] : []),
    ...budget.map(a => ({ type: 'account' as const, data: a })),
    ...(offBudget.length > 0 ? [{ type: 'header' as const, label: 'Off Budget' }] : []),
    ...offBudget.map(a => ({ type: 'account' as const, data: a })),
  ];

  return (
    <View style={styles.container}>
      {loading && accounts.length === 0 ? (
        <ActivityIndicator style={{ marginTop: 40 }} color="#3b82f6" />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item, i) => item.type === 'header' ? `h-${i}` : item.data.id}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={sync}
              tintColor="#3b82f6"
              colors={['#3b82f6']}
            />
          }
          renderItem={({ item }) => {
            if (item.type === 'header') {
              return <Text style={styles.sectionHeader}>{item.label}</Text>;
            }
            const a = item.data;
            return (
              <Pressable
                style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
                onPress={() => router.push(`/(auth)/account/${a.id}`)}
              >
                <Text style={styles.accountName}>{a.name}</Text>
                <Text style={[styles.balance, (a.balance ?? 0) < 0 && styles.negative]}>
                  {formatBalance(a.balance ?? 0)}
                </Text>
              </Pressable>
            );
          }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>No accounts yet</Text>
              <Text style={styles.emptyHint}>Tap + to add your first account</Text>
            </View>
          }
          contentContainerStyle={{ paddingBottom: 100 }}
        />
      )}

      {/* FAB — add new account */}
      <Pressable
        style={styles.fab}
        onPress={() => router.push('/(auth)/account/new')}
      >
        <Text style={styles.fabText}>+</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a', paddingHorizontal: 16, paddingTop: 8, position: 'relative' },
  sectionHeader: {
    color: '#64748b', fontSize: 11, fontWeight: '700', textTransform: 'uppercase',
    letterSpacing: 1, marginTop: 20, marginBottom: 8,
  },
  card: {
    backgroundColor: '#1e293b', borderRadius: 10, padding: 16, marginBottom: 8,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderWidth: 1, borderColor: '#334155',
  },
  cardPressed: { opacity: 0.7 },
  accountName: { color: '#f1f5f9', fontSize: 15, fontWeight: '500', flex: 1 },
  balance: { color: '#4ade80', fontSize: 15, fontWeight: '600' },
  negative: { color: '#f87171' },
  empty: { alignItems: 'center', marginTop: 80, gap: 8 },
  emptyText: { color: '#f1f5f9', fontSize: 18, fontWeight: '600' },
  emptyHint: { color: '#64748b', fontSize: 13 },
  fab: {
    position: 'absolute', bottom: 28, right: 8,
    backgroundColor: '#3b82f6', width: 56, height: 56,
    borderRadius: 28, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 8,
  },
  fabText: { color: '#fff', fontSize: 28, lineHeight: 32, fontWeight: '300' },
});
