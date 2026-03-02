import { useEffect } from 'react';
import {
  ActivityIndicator,
  SectionList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useBudgetStore } from '../../../src/stores/budgetStore';
import type { BudgetCategory } from '../../../src/budgets/types';

function fmt(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  return `${sign}$${(Math.abs(cents) / 100).toFixed(2)}`;
}

function MonthNav({ month, onPrev, onNext }: { month: string; onPrev: () => void; onNext: () => void }) {
  const [year, m] = month.split('-');
  const label = new Date(Number(year), Number(m) - 1).toLocaleString('default', { month: 'long', year: 'numeric' });
  return (
    <View style={styles.monthNav}>
      <TouchableOpacity onPress={onPrev} style={styles.arrow}><Text style={styles.arrowText}>‹</Text></TouchableOpacity>
      <Text style={styles.monthLabel}>{label}</Text>
      <TouchableOpacity onPress={onNext} style={styles.arrow}><Text style={styles.arrowText}>›</Text></TouchableOpacity>
    </View>
  );
}

function CategoryRow({ item: c }: { item: BudgetCategory }) {
  const available = c.budgeted + c.spent;
  return (
    <View style={styles.row}>
      <Text style={styles.catName}>{c.name}</Text>
      <View style={styles.amounts}>
        <Text style={styles.amtLabel}>Budgeted</Text>
        <Text style={styles.amt}>{fmt(c.budgeted)}</Text>
      </View>
      <View style={styles.amounts}>
        <Text style={styles.amtLabel}>Spent</Text>
        <Text style={[styles.amt, c.spent < 0 && styles.spent]}>{fmt(c.spent)}</Text>
      </View>
      <View style={styles.amounts}>
        <Text style={styles.amtLabel}>Available</Text>
        <Text style={[styles.amt, available < 0 && styles.overspent]}>{fmt(available)}</Text>
      </View>
    </View>
  );
}

export default function BudgetScreen() {
  const { month, data, loading, setMonth, load } = useBudgetStore();

  useEffect(() => { load(); }, [month]);

  function prevMonth() {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(y, m - 2);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }

  function nextMonth() {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(y, m);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }

  const sections = (data?.groups ?? []).map(g => ({
    title: g.name,
    data: g.categories,
  }));

  return (
    <View style={styles.container}>
      <MonthNav month={month} onPrev={prevMonth} onNext={nextMonth} />

      {loading && sections.length === 0 ? (
        <ActivityIndicator style={{ marginTop: 40 }} color="#3b82f6" />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={c => c.id}
          renderItem={({ item }) => <CategoryRow item={item} />}
          renderSectionHeader={({ section }) => (
            <Text style={styles.groupHeader}>{section.title}</Text>
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>No categories</Text>
              <Text style={styles.emptyHint}>Sync to load budget data</Text>
            </View>
          }
          stickySectionHeadersEnabled={false}
          contentContainerStyle={{ paddingBottom: 40 }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  monthNav: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 16, borderBottomWidth: 1, borderBottomColor: '#1e293b',
  },
  arrow: { padding: 8 },
  arrowText: { color: '#3b82f6', fontSize: 24, fontWeight: '700' },
  monthLabel: { color: '#f1f5f9', fontSize: 16, fontWeight: '600' },
  groupHeader: {
    color: '#64748b', fontSize: 11, fontWeight: '700', textTransform: 'uppercase',
    letterSpacing: 1, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 6,
    backgroundColor: '#0f172a',
  },
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 12, paddingHorizontal: 16,
    borderBottomWidth: 1, borderBottomColor: '#1e293b',
  },
  catName: { flex: 1, color: '#e2e8f0', fontSize: 14 },
  amounts: { alignItems: 'flex-end', minWidth: 64, marginLeft: 8 },
  amtLabel: { color: '#475569', fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5 },
  amt: { color: '#f1f5f9', fontSize: 13, fontWeight: '500' },
  spent: { color: '#f87171' },
  overspent: { color: '#f87171' },
  empty: { alignItems: 'center', marginTop: 80, gap: 8 },
  emptyText: { color: '#f1f5f9', fontSize: 18, fontWeight: '600' },
  emptyHint: { color: '#64748b', fontSize: 13 },
});
