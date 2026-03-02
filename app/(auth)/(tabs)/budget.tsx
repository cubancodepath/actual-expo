import { useEffect, useMemo, useState } from 'react';
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
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
// Hold for Next Month bar + modal
// ---------------------------------------------------------------------------

function HoldModal({
  visible,
  current,
  maxAmount,
  onSave,
  onClose,
}: {
  visible: boolean;
  current: number;
  maxAmount: number;
  onSave: (amount: number) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState('');

  // Pre-fill with current hold amount when modal opens
  useEffect(() => {
    if (visible) {
      setValue(current > 0 ? (current / 100).toFixed(2) : '');
    }
  }, [visible, current]);

  function handleSave() {
    const cents = Math.round(parseFloat(value.replace(/[^0-9.]/g, '')) * 100);
    if (!isNaN(cents) && cents >= 0) {
      onSave(cents);
    }
    onClose();
  }

  const max = (maxAmount / 100).toFixed(2);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={holdStyles.overlay} onPress={onClose}>
        <Pressable style={holdStyles.sheet} onPress={e => e.stopPropagation()}>
          <Text style={holdStyles.title}>Hold for Next Month</Text>
          <Text style={holdStyles.subtitle}>
            Move money from "To Budget" to next month.{'\n'}
            Available to hold: <Text style={holdStyles.maxAmt}>${max}</Text>
          </Text>

          <View style={holdStyles.inputRow}>
            <Text style={holdStyles.dollar}>$</Text>
            <TextInput
              style={holdStyles.input}
              value={value}
              onChangeText={setValue}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor="#475569"
              autoFocus
              selectTextOnFocus
              onSubmitEditing={handleSave}
            />
          </View>

          <View style={holdStyles.actions}>
            <Pressable style={holdStyles.cancelBtn} onPress={onClose}>
              <Text style={holdStyles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable style={holdStyles.saveBtn} onPress={handleSave}>
              <Text style={holdStyles.saveText}>Hold</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function HoldBar({
  buffered,
  toBudget,
  onHold,
  onReset,
}: {
  buffered: number;
  toBudget: number;
  onHold: () => void;
  onReset: () => void;
}) {
  // Show bar when there's an active hold OR when there's money available to hold
  if (buffered === 0 && toBudget <= 0) return null;

  return (
    <View style={holdStyles.bar}>
      <View style={holdStyles.barLeft}>
        <Text style={holdStyles.barIcon}>→</Text>
        <View>
          <Text style={holdStyles.barLabel}>Held for Next Month</Text>
          {buffered > 0 && (
            <Text style={holdStyles.barAmt}>{fmt(buffered)}</Text>
          )}
        </View>
      </View>
      <View style={holdStyles.barRight}>
        {buffered > 0 && (
          <Pressable style={holdStyles.resetBtn} onPress={onReset} hitSlop={8}>
            <Text style={holdStyles.resetText}>Reset</Text>
          </Pressable>
        )}
        <Pressable style={holdStyles.holdBtn} onPress={onHold} hitSlop={8}>
          <Text style={holdStyles.holdBtnText}>
            {buffered > 0 ? 'Edit' : 'Hold'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Overspending banner
// ---------------------------------------------------------------------------

function OverspendingBanner({
  count,
  total,
}: {
  count: number;
  total: number; // negative cents, e.g. -3450 means $34.50 overspent
}) {
  return (
    <View style={ovStyles.banner}>
      <View style={ovStyles.left}>
        <Text style={ovStyles.icon}>⚠</Text>
        <View>
          <Text style={ovStyles.title}>
            {count} overspent {count === 1 ? 'category' : 'categories'}
          </Text>
          <Text style={ovStyles.subtitle}>
            {fmt(total)} over budget this month
          </Text>
        </View>
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
  const { month, data, loading, setMonth, load, setAmount, hold, resetHold, setCarryover } = useBudgetStore();
  const { refreshing, sync } = useSyncStore();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [holdModalVisible, setHoldModalVisible] = useState(false);

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

  const overspentCategories = useMemo(() => {
    if (!data) return [];
    return data.groups
      .filter(g => !g.is_income)
      .flatMap(g => g.categories.filter(c => c.balance < 0 && !c.carryover));
  }, [data]);

  const totalOverspent = useMemo(
    () => overspentCategories.reduce((sum, c) => sum + c.balance, 0),
    [overspentCategories],
  );

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

  function handleCategoryLongPress(cat: BudgetCategory) {
    const toggleLabel = cat.carryover ? 'Remove overspending rollover' : 'Rollover overspending';
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: [toggleLabel, 'Cancel'], cancelButtonIndex: 1 },
        idx => { if (idx === 0) setCarryover(cat.id, !cat.carryover); },
      );
    } else {
      Alert.alert(cat.name, undefined, [
        { text: toggleLabel, onPress: () => setCarryover(cat.id, !cat.carryover) },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
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

    const hasCarryIn = cat.carryIn !== 0;

    return (
      <Pressable
        style={styles.catRow}
        onLongPress={() => handleCategoryLongPress(cat)}
        delayLongPress={400}
      >
        {/* Name + optional carryover indicator */}
        <View style={styles.catNameWrap}>
          <Text style={styles.catName} numberOfLines={1}>
            {cat.name}
          </Text>
          {cat.carryover && (
            <Text style={styles.carryoverDot}>↻</Text>
          )}
        </View>

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

        {/* Balance — show carry-in annotation when non-zero */}
        <View style={{ width: COL_BAL, alignItems: 'flex-end' }}>
          <Text
            style={[
              styles.catAmt,
              cat.balance < 0
                ? styles.colorNegative
                : cat.balance > 0
                  ? styles.colorPositive
                  : styles.dimmed,
            ]}
          >
            {fmt(cat.balance)}
          </Text>
          {hasCarryIn && (
            <Text style={[styles.carryInLabel, cat.carryIn < 0 ? styles.colorNegative : styles.colorPositive]}>
              {cat.carryIn > 0 ? '+' : ''}{fmt(cat.carryIn)}
            </Text>
          )}
        </View>
      </Pressable>
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

      {data && (
        <HoldBar
          buffered={data.buffered}
          toBudget={data.toBudget}
          onHold={() => setHoldModalVisible(true)}
          onReset={async () => {
            await resetHold();
          }}
        />
      )}

      {overspentCategories.length > 0 && (
        <OverspendingBanner count={overspentCategories.length} total={totalOverspent} />
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

      <HoldModal
        visible={holdModalVisible}
        current={data?.buffered ?? 0}
        maxAmount={Math.max((data?.toBudget ?? 0) + (data?.buffered ?? 0), 0)}
        onSave={async (amount) => { await hold(amount); }}
        onClose={() => setHoldModalVisible(false)}
      />

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
  catNameWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4, overflow: 'hidden' },
  catName: { color: '#e2e8f0', fontSize: 14, flexShrink: 1 },
  carryoverDot: { color: '#818cf8', fontSize: 11, fontWeight: '700' },
  catAmt: { fontSize: 14, fontWeight: '500', color: '#f1f5f9', textAlign: 'right' },
  carryInLabel: { fontSize: 10, fontWeight: '600', textAlign: 'right', marginTop: 1 },

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

const ovStyles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#450a0a',
    borderBottomWidth: 1,
    borderTopWidth: 1,
    borderColor: '#7f1d1d',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  left: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  icon: { fontSize: 18, color: '#fca5a5' },
  title: { color: '#fca5a5', fontSize: 13, fontWeight: '700' },
  subtitle: { color: '#f87171', fontSize: 12, marginTop: 1 },
});

const holdStyles = StyleSheet.create({
  // Hold bar (below summary)
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1a1f35',
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#1e3a5f',
  },
  barLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  barIcon: { fontSize: 18, color: '#818cf8' },
  barLabel: { color: '#93c5fd', fontSize: 13, fontWeight: '600' },
  barAmt: { color: '#818cf8', fontSize: 14, fontWeight: '700', marginTop: 1 },
  barRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  resetBtn: {
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 6, borderWidth: 1, borderColor: '#475569',
  },
  resetText: { color: '#94a3b8', fontSize: 12, fontWeight: '600' },
  holdBtn: {
    paddingHorizontal: 12, paddingVertical: 5,
    backgroundColor: '#3730a3', borderRadius: 6,
  },
  holdBtnText: { color: '#c7d2fe', fontSize: 12, fontWeight: '700' },

  // Hold modal
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center', alignItems: 'center',
  },
  sheet: {
    backgroundColor: '#1e293b', borderRadius: 16,
    padding: 24, width: '85%', gap: 16,
    borderWidth: 1, borderColor: '#334155',
  },
  title: { color: '#f1f5f9', fontSize: 17, fontWeight: '700' },
  subtitle: { color: '#64748b', fontSize: 13, lineHeight: 19 },
  maxAmt: { color: '#818cf8', fontWeight: '700' },
  inputRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#0f172a', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12,
    borderWidth: 1, borderColor: '#334155',
  },
  dollar: { color: '#818cf8', fontSize: 20, fontWeight: '600' },
  input: { flex: 1, color: '#f1f5f9', fontSize: 20, fontWeight: '600', padding: 0 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  cancelBtn: {
    flex: 1, paddingVertical: 12, alignItems: 'center',
    borderRadius: 10, borderWidth: 1, borderColor: '#334155',
  },
  cancelText: { color: '#94a3b8', fontWeight: '600', fontSize: 15 },
  saveBtn: {
    flex: 1, paddingVertical: 12, alignItems: 'center',
    borderRadius: 10, backgroundColor: '#3730a3',
  },
  saveText: { color: '#c7d2fe', fontWeight: '700', fontSize: 15 },
});
