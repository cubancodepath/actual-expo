import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useBudgetStore } from '../../../src/stores/budgetStore';
import { useSyncStore } from '../../../src/stores/syncStore';
import type { BudgetCategory, BudgetGroup } from '../../../src/budgets/types';

// ---------------------------------------------------------------------------
// Column widths (consistent between headers and rows)
// ---------------------------------------------------------------------------
const COL_BUDGET = 76;
const COL_SPENT = 68;
const COL_BAL = 72;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt(cents: number): string {
  if (cents === 0) return '$0.00';
  const sign = cents < 0 ? '-' : '';
  return `${sign}$${(Math.abs(cents) / 100).toFixed(2)}`;
}

function parseCents(s: string): number {
  const n = parseFloat(s.replace(/[^0-9.]/g, ''));
  return isNaN(n) ? 0 : Math.round(n * 100);
}

// ---------------------------------------------------------------------------
// Month navigation
// ---------------------------------------------------------------------------

function MonthNav({
  month,
  onPrev,
  onNext,
}: {
  month: string;
  onPrev: () => void;
  onNext: () => void;
}) {
  const [year, m] = month.split('-');
  const label = new Date(Number(year), Number(m) - 1).toLocaleString('default', {
    month: 'long',
    year: 'numeric',
  });
  return (
    <View style={styles.monthNav}>
      <Pressable onPress={onPrev} hitSlop={12}>
        <Text style={styles.navArrow}>‹</Text>
      </Pressable>
      <Text style={styles.monthLabel}>{label}</Text>
      <Pressable onPress={onNext} hitSlop={12}>
        <Text style={styles.navArrow}>›</Text>
      </Pressable>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Summary bar
// ---------------------------------------------------------------------------

function SummaryBar({
  income,
  budgeted,
  toBudget,
}: {
  income: number;
  budgeted: number;
  toBudget: number;
}) {
  return (
    <View style={styles.summary}>
      <View style={styles.summaryCol}>
        <Text style={styles.summaryLabel}>Income</Text>
        <Text style={[styles.summaryValue, styles.colorIncome]}>{fmt(income)}</Text>
      </View>
      <View style={styles.summaryDivider} />
      <View style={styles.summaryCol}>
        <Text style={styles.summaryLabel}>Budgeted</Text>
        <Text style={styles.summaryValue}>{fmt(budgeted)}</Text>
      </View>
      <View style={styles.summaryDivider} />
      <View style={styles.summaryCol}>
        <Text style={styles.summaryLabel}>To Budget</Text>
        <Text
          style={[
            styles.summaryValue,
            styles.toBudgetValue,
            toBudget < 0 ? styles.colorNegative : styles.colorIncome,
          ]}
        >
          {fmt(toBudget)}
        </Text>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Section type
// ---------------------------------------------------------------------------

type BudgetSection = {
  key: string;
  title: string;
  group: BudgetGroup;
  data: BudgetCategory[];
};

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function BudgetScreen() {
  const router = useRouter();
  const { month, data, loading, setMonth, load, setAmount } = useBudgetStore();
  const { refreshing, sync } = useSyncStore();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  useEffect(() => {
    load();
  }, [month]);

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

  function startEdit(id: string, currentCents: number) {
    setEditingId(id);
    setEditValue((Math.abs(currentCents) / 100).toFixed(2));
  }

  async function saveEdit() {
    if (!editingId) return;
    const id = editingId;
    setEditingId(null);
    await setAmount(id, parseCents(editValue));
  }

  const sections: BudgetSection[] = (data?.groups ?? []).map(g => ({
    key: g.id,
    title: g.name,
    group: g,
    data: g.categories,
  }));

  function renderSectionHeader({ section }: { section: BudgetSection }) {
    const g = section.group;

    if (g.is_income) {
      return (
        <View style={styles.groupHeader}>
          <Text style={styles.groupName}>{g.name}</Text>
          <Text style={[styles.groupAmt, { width: COL_BAL }, styles.colorIncome]}>
            {fmt(g.spent)}
          </Text>
        </View>
      );
    }

    return (
      <View style={styles.groupHeader}>
        <Text style={styles.groupName}>{g.name}</Text>
        <Text style={[styles.groupAmt, { width: COL_BUDGET }]}>{fmt(g.budgeted)}</Text>
        <Text
          style={[
            styles.groupAmt,
            { width: COL_SPENT },
            g.spent < 0 && styles.colorSpent,
          ]}
        >
          {g.spent !== 0 ? fmt(g.spent) : '—'}
        </Text>
        <Text
          style={[
            styles.groupAmt,
            { width: COL_BAL },
            g.balance < 0 ? styles.colorNegative : styles.colorPositive,
          ]}
        >
          {fmt(g.balance)}
        </Text>
      </View>
    );
  }

  function renderItem({
    item: cat,
    section,
  }: {
    item: BudgetCategory;
    section: BudgetSection;
  }) {
    const isEditing = editingId === cat.id;
    const isIncome = section.group.is_income;

    if (isIncome) {
      return (
        <View style={styles.catRow}>
          <Text style={styles.catName} numberOfLines={1}>
            {cat.name}
          </Text>
          <Text style={[styles.catAmt, { width: COL_BAL }, styles.colorIncome]}>
            {fmt(cat.spent)}
          </Text>
        </View>
      );
    }

    return (
      <View style={styles.catRow}>
        <Text style={styles.catName} numberOfLines={1}>
          {cat.name}
        </Text>

        {/* Budgeted — tappable, inline editable */}
        <Pressable
          style={{ width: COL_BUDGET, alignItems: 'flex-end' }}
          onPress={() => startEdit(cat.id, cat.budgeted)}
        >
          {isEditing ? (
            <TextInput
              style={styles.budgetInput}
              value={editValue}
              onChangeText={setEditValue}
              onBlur={saveEdit}
              onSubmitEditing={saveEdit}
              keyboardType="decimal-pad"
              autoFocus
              selectTextOnFocus
            />
          ) : (
            <Text style={[styles.catAmt, cat.budgeted === 0 && styles.dimmed]}>
              {fmt(cat.budgeted)}
            </Text>
          )}
        </Pressable>

        {/* Spent */}
        <Text style={[styles.catAmt, { width: COL_SPENT }, cat.spent < 0 && styles.colorSpent]}>
          {cat.spent !== 0 ? fmt(cat.spent) : '—'}
        </Text>

        {/* Balance */}
        <Text
          style={[
            styles.catAmt,
            { width: COL_BAL },
            cat.balance < 0
              ? styles.colorNegative
              : cat.balance > 0
                ? styles.colorPositive
                : styles.dimmed,
          ]}
        >
          {fmt(cat.balance)}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <MonthNav month={month} onPrev={prevMonth} onNext={nextMonth} />
        <Pressable style={styles.manageBtn} onPress={() => router.push('/(auth)/categories')}>
          <Text style={styles.manageBtnText}>Manage</Text>
        </Pressable>
      </View>

      {data && (
        <SummaryBar income={data.income} budgeted={data.budgeted} toBudget={data.toBudget} />
      )}

      {/* Column headers */}
      {data && (
        <View style={styles.colHeaders}>
          <View style={{ flex: 1 }} />
          <Text style={[styles.colHeader, { width: COL_BUDGET }]}>BUDGETED</Text>
          <Text style={[styles.colHeader, { width: COL_SPENT }]}>SPENT</Text>
          <Text style={[styles.colHeader, { width: COL_BAL }]}>BALANCE</Text>
        </View>
      )}

      {loading && !data ? (
        <ActivityIndicator color="#3b82f6" style={{ marginTop: 40 }} />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={c => c.id}
          renderItem={renderItem}
          renderSectionHeader={renderSectionHeader}
          stickySectionHeadersEnabled={false}
          extraData={{ editingId, editValue }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={sync}
              tintColor="#3b82f6"
              colors={['#3b82f6']}
            />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>No categories yet</Text>
              <Text style={styles.emptyHint}>Sync to load budget data</Text>
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
  topBar: { flexDirection: 'row', alignItems: 'center' },
  manageBtn: { paddingHorizontal: 14, paddingVertical: 12 },
  manageBtnText: { color: '#3b82f6', fontSize: 13, fontWeight: '600' },

  // Month nav
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  navArrow: { color: '#3b82f6', fontSize: 26, fontWeight: '700' },
  monthLabel: { color: '#f1f5f9', fontSize: 16, fontWeight: '600' },

  // Summary bar
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  summaryCol: { flex: 1, alignItems: 'center' },
  summaryDivider: { width: 1, height: 32, backgroundColor: '#334155' },
  summaryLabel: {
    color: '#64748b',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  summaryValue: { color: '#f1f5f9', fontSize: 15, fontWeight: '700' },
  toBudgetValue: { fontSize: 17 },

  // Column headers
  colHeaders: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 4,
    backgroundColor: '#0f172a',
  },
  colHeader: {
    color: '#334155',
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    textAlign: 'right',
  },

  // Group header (section header)
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 9,
    backgroundColor: '#1e293b',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#334155',
    marginTop: 6,
  },
  groupName: {
    flex: 1,
    color: '#cbd5e1',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  groupAmt: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'right',
  },

  // Category row
  catRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
    backgroundColor: '#0f172a',
  },
  catName: { flex: 1, color: '#e2e8f0', fontSize: 14 },
  catAmt: { fontSize: 14, fontWeight: '500', color: '#f1f5f9', textAlign: 'right' },

  // Inline budget input
  budgetInput: {
    color: '#60a5fa',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'right',
    padding: 0,
    minWidth: 56,
    borderBottomWidth: 1,
    borderBottomColor: '#3b82f6',
  },

  // Colors
  colorIncome: { color: '#4ade80' },
  colorPositive: { color: '#4ade80' },
  colorNegative: { color: '#f87171' },
  colorSpent: { color: '#94a3b8' },
  dimmed: { color: '#475569' },

  // Empty state
  empty: { alignItems: 'center', marginTop: 80, gap: 8 },
  emptyText: { color: '#94a3b8', fontSize: 16, fontWeight: '600' },
  emptyHint: { color: '#475569', fontSize: 13 },
});
