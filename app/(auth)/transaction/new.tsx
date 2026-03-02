import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAccountsStore } from '../../../src/stores/accountsStore';
import { useTransactionsStore } from '../../../src/stores/transactionsStore';
import { useCategoriesStore } from '../../../src/stores/categoriesStore';
import { usePayeesStore } from '../../../src/stores/payeesStore';
import { findOrCreatePayee } from '../../../src/payees';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function todayStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function todayInt(): number {
  return parseInt(todayStr().replace(/-/g, ''), 10);
}

/** Parse "YYYY-MM-DD" → YYYYMMDD integer. Returns null if invalid. */
function parseDateStr(s: string): number | null {
  const clean = s.replace(/\D/g, '');
  if (clean.length !== 8) return null;
  const num = parseInt(clean, 10);
  if (isNaN(num)) return null;
  return num;
}

function formatDateStr(s: string): string {
  // Auto-insert dashes as user types: "20250302" → "2025-03-02"
  const d = s.replace(/\D/g, '');
  if (d.length <= 4) return d;
  if (d.length <= 6) return `${d.slice(0, 4)}-${d.slice(4)}`;
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
}

function parseToCents(raw: string): number {
  const cleaned = raw.replace(/[^0-9.]/g, '');
  const num = parseFloat(cleaned);
  if (isNaN(num)) return 0;
  return Math.round(num * 100);
}

// ---------------------------------------------------------------------------
// Payee picker modal
// ---------------------------------------------------------------------------

type PayeeSelection = { id: string | null; name: string };

function PayeePicker({
  visible,
  onClose,
  onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  onSelect: (selection: PayeeSelection) => void;
}) {
  const { payees, load } = usePayeesStore();
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (visible && payees.length === 0) load();
  }, [visible]);

  // Split into transfer payees (accounts) and regular payees
  const transfers = payees.filter(p => p.transfer_acct != null);
  const regular   = [...payees.filter(p => p.transfer_acct == null)].sort((a, b) => {
    if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  const query = search.toLowerCase();
  const filteredTransfers = query ? transfers.filter(p => p.name.toLowerCase().includes(query)) : transfers;
  const filteredRegular   = query ? regular.filter(p => p.name.toLowerCase().includes(query))   : regular;

  const exactMatch = payees.some(p => p.name.toLowerCase() === search.trim().toLowerCase());

  function select(selection: PayeeSelection) {
    setSearch('');
    onSelect(selection);
    onClose();
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={ppicker.container}>
        <View style={ppicker.header}>
          <Text style={ppicker.title}>Payee</Text>
          <Pressable onPress={() => { setSearch(''); onClose(); }} hitSlop={12}>
            <Text style={ppicker.cancel}>Cancel</Text>
          </Pressable>
        </View>

        <View style={ppicker.searchWrap}>
          <TextInput
            style={ppicker.search}
            placeholder="Search payees or accounts…"
            placeholderTextColor="#475569"
            value={search}
            onChangeText={setSearch}
            autoFocus
            clearButtonMode="while-editing"
            returnKeyType="done"
            onSubmitEditing={() => { if (search.trim()) select({ id: null, name: search.trim() }); }}
          />
        </View>

        <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
          {/* No payee */}
          <Pressable style={ppicker.item} onPress={() => select({ id: null, name: '' })}>
            <Text style={ppicker.itemNone}>No payee</Text>
          </Pressable>

          {/* Transfer to account section */}
          {filteredTransfers.length > 0 && (
            <>
              <Text style={ppicker.sectionHeader}>Transfer to Account</Text>
              {filteredTransfers.map(p => (
                <Pressable key={p.id} style={ppicker.item} onPress={() => select({ id: p.id, name: p.name })}>
                  <Text style={ppicker.transferArrow}>⇄  </Text>
                  <Text style={ppicker.itemText}>{p.name}</Text>
                </Pressable>
              ))}
            </>
          )}

          {/* Regular payees */}
          {filteredRegular.length > 0 && (
            <>
              {filteredTransfers.length > 0 && <Text style={ppicker.sectionHeader}>Payees</Text>}
              {/* "Create new" row */}
              {search.trim() !== '' && !exactMatch && (
                <Pressable style={ppicker.item} onPress={() => select({ id: null, name: search.trim() })}>
                  <Text style={ppicker.itemCreate}>Create "{search.trim()}"</Text>
                </Pressable>
              )}
              {filteredRegular.map(p => (
                <Pressable key={p.id} style={ppicker.item} onPress={() => select({ id: p.id, name: p.name })}>
                  {p.favorite && <Text style={ppicker.star}>★ </Text>}
                  <Text style={ppicker.itemText}>{p.name}</Text>
                </Pressable>
              ))}
            </>
          )}

          {/* "Create new" when no regular payees shown */}
          {filteredRegular.length === 0 && search.trim() !== '' && !exactMatch && (
            <Pressable style={ppicker.item} onPress={() => select({ id: null, name: search.trim() })}>
              <Text style={ppicker.itemCreate}>Create "{search.trim()}"</Text>
            </Pressable>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Category picker modal
// ---------------------------------------------------------------------------

function CategoryPicker({
  visible,
  onClose,
  onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  onSelect: (id: string | null, name: string) => void;
}) {
  const { groups, categories } = useCategoriesStore();

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={picker.container}>
        <View style={picker.header}>
          <Text style={picker.title}>Category</Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <Text style={picker.cancel}>Cancel</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
          {/* No category option */}
          <Pressable
            style={picker.item}
            onPress={() => { onSelect(null, 'No category'); onClose(); }}
          >
            <Text style={picker.itemNone}>No category</Text>
          </Pressable>

          {groups.filter(g => !g.hidden && !g.tombstone).map(g => {
            const cats = categories.filter(c => c.cat_group === g.id && !c.hidden && !c.tombstone);
            if (cats.length === 0) return null;
            return (
              <View key={g.id}>
                <Text style={picker.groupLabel}>{g.name}</Text>
                {cats.map(c => (
                  <Pressable
                    key={c.id}
                    style={picker.item}
                    onPress={() => { onSelect(c.id, c.name); onClose(); }}
                  >
                    <Text style={picker.itemText}>{c.name}</Text>
                  </Pressable>
                ))}
              </View>
            );
          })}
        </ScrollView>
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function NewTransactionScreen() {
  const { accountId } = useLocalSearchParams<{ accountId: string }>();
  const router = useRouter();
  const { load: loadAccounts } = useAccountsStore();
  const { add } = useTransactionsStore();
  const { groups, categories, load: loadCategories } = useCategoriesStore();

  const [type, setType] = useState<'expense' | 'income'>('expense');
  const [amountStr, setAmountStr] = useState('');
  const [payeeId, setPayeeId] = useState<string | null>(null);
  const [payeeName, setPayeeName] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [categoryName, setCategoryName] = useState<string>('');
  const [dateStr, setDateStr] = useState(todayStr());
  const [notes, setNotes] = useState('');
  const [cleared, setCleared] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [categoryPickerVisible, setCategoryPickerVisible] = useState(false);
  const [payeePickerVisible, setPayeePickerVisible] = useState(false);

  useEffect(() => {
    if (groups.length === 0) loadCategories();
  }, []);

  async function handleSave() {
    const cents = parseToCents(amountStr);
    if (cents === 0) { setError('Enter an amount'); return; }

    const date = parseDateStr(dateStr) ?? todayInt();
    const finalAmount = type === 'expense' ? -Math.abs(cents) : Math.abs(cents);

    setError(null);
    setLoading(true);
    try {
      // Use stored payeeId directly (transfer payees) or find/create by name (regular payees)
      const resolvedPayeeId = payeeId ?? await findOrCreatePayee(payeeName);
      await add({
        acct: accountId,
        date,
        amount: finalAmount,
        description: resolvedPayeeId,
        category: categoryId,
        notes: notes.trim() || null,
        cleared,
      });
      await loadAccounts();
      router.back();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">

        {/* Expense / Income toggle */}
        <View style={styles.typeRow}>
          <Pressable
            style={[styles.typeBtn, type === 'expense' && styles.typeBtnActive]}
            onPress={() => setType('expense')}
          >
            <Text style={[styles.typeBtnText, type === 'expense' && styles.typeBtnTextActive]}>
              Expense
            </Text>
          </Pressable>
          <Pressable
            style={[styles.typeBtn, type === 'income' && styles.typeBtnIncomeActive]}
            onPress={() => setType('income')}
          >
            <Text style={[styles.typeBtnText, type === 'income' && styles.typeBtnTextActive]}>
              Income
            </Text>
          </Pressable>
        </View>

        {/* Amount */}
        <Text style={styles.label}>Amount *</Text>
        <View style={styles.amountRow}>
          <Text style={[styles.currency, type === 'income' ? styles.incomeColor : styles.expenseColor]}>
            {type === 'expense' ? '-$' : '+$'}
          </Text>
          <TextInput
            style={[styles.input, styles.amountInput]}
            placeholder="0.00"
            placeholderTextColor="#475569"
            value={amountStr}
            onChangeText={v => { setAmountStr(v); setError(null); }}
            keyboardType="decimal-pad"
            autoFocus
          />
        </View>

        {/* Payee */}
        <Text style={styles.label}>Payee</Text>
        <Pressable style={styles.picker} onPress={() => setPayeePickerVisible(true)}>
          <Text style={payeeName ? styles.pickerValue : styles.pickerPlaceholder}>
            {payeeName || 'Select or create payee'}
          </Text>
          <Text style={styles.pickerArrow}>›</Text>
        </Pressable>

        {/* Category */}
        <Text style={styles.label}>Category</Text>
        <Pressable style={styles.picker} onPress={() => setCategoryPickerVisible(true)}>
          <Text style={categoryId ? styles.pickerValue : styles.pickerPlaceholder}>
            {categoryId ? categoryName : 'No category'}
          </Text>
          <Text style={styles.pickerArrow}>›</Text>
        </Pressable>

        {/* Date */}
        <Text style={styles.label}>Date</Text>
        <TextInput
          style={styles.input}
          placeholder="YYYY-MM-DD"
          placeholderTextColor="#475569"
          value={dateStr}
          onChangeText={v => setDateStr(formatDateStr(v))}
          keyboardType="number-pad"
          maxLength={10}
          returnKeyType="next"
        />

        {/* Notes */}
        <Text style={styles.label}>Notes</Text>
        <TextInput
          style={styles.input}
          placeholder="Optional"
          placeholderTextColor="#475569"
          value={notes}
          onChangeText={setNotes}
          returnKeyType="done"
        />

        {/* Cleared */}
        <View style={styles.clearedRow}>
          <Text style={styles.clearedLabel}>Cleared</Text>
          <Switch
            value={cleared}
            onValueChange={setCleared}
            trackColor={{ false: '#334155', true: '#1d4ed8' }}
            thumbColor={cleared ? '#93c5fd' : '#64748b'}
          />
        </View>

        {error && <Text style={styles.error}>{error}</Text>}

        <Pressable
          style={[styles.button, (!amountStr || loading) && styles.buttonDisabled]}
          onPress={handleSave}
          disabled={!amountStr || loading}
        >
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.buttonText}>Add Transaction</Text>
          }
        </Pressable>

      </ScrollView>

      <PayeePicker
        visible={payeePickerVisible}
        onClose={() => setPayeePickerVisible(false)}
        onSelect={({ id, name }) => { setPayeeId(id); setPayeeName(name); }}
      />
      <CategoryPicker
        visible={categoryPickerVisible}
        onClose={() => setCategoryPickerVisible(false)}
        onSelect={(id, name) => { setCategoryId(id); setCategoryName(name); }}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#0f172a' },
  container: { padding: 20, gap: 8 },

  typeRow: {
    flexDirection: 'row', gap: 8, marginBottom: 8,
    backgroundColor: '#1e293b', borderRadius: 10, padding: 4,
  },
  typeBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8 },
  typeBtnActive: { backgroundColor: '#ef4444' },
  typeBtnIncomeActive: { backgroundColor: '#16a34a' },
  typeBtnText: { color: '#64748b', fontWeight: '600', fontSize: 14 },
  typeBtnTextActive: { color: '#fff' },

  label: {
    color: '#94a3b8', fontSize: 12, fontWeight: '700',
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4, marginTop: 8,
  },
  input: {
    backgroundColor: '#1e293b', color: '#f1f5f9', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 14, fontSize: 16,
    borderWidth: 1, borderColor: '#334155',
  },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  currency: { fontSize: 22, fontWeight: '600' },
  expenseColor: { color: '#f87171' },
  incomeColor: { color: '#4ade80' },
  amountInput: { flex: 1 },

  picker: {
    backgroundColor: '#1e293b', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 14,
    borderWidth: 1, borderColor: '#334155', flexDirection: 'row', justifyContent: 'space-between',
  },
  pickerValue: { color: '#f1f5f9', fontSize: 16 },
  pickerPlaceholder: { color: '#475569', fontSize: 16 },
  pickerArrow: { color: '#64748b', fontSize: 18 },

  clearedRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#1e293b', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
    borderWidth: 1, borderColor: '#334155', marginTop: 8,
  },
  clearedLabel: { color: '#f1f5f9', fontSize: 15 },

  error: { color: '#f87171', fontSize: 13 },
  button: {
    backgroundColor: '#3b82f6', borderRadius: 10,
    paddingVertical: 16, alignItems: 'center', marginTop: 16,
  },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});

const picker = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 16, borderBottomWidth: 1, borderBottomColor: '#1e293b',
  },
  title: { color: '#f1f5f9', fontSize: 17, fontWeight: '600' },
  cancel: { color: '#3b82f6', fontSize: 16 },
  groupLabel: {
    color: '#64748b', fontSize: 11, fontWeight: '700', textTransform: 'uppercase',
    letterSpacing: 1, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#0f172a',
  },
  item: {
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#1e293b',
  },
  itemText: { color: '#f1f5f9', fontSize: 16 },
  itemNone: { color: '#64748b', fontSize: 16 },
});

const ppicker = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 16, borderBottomWidth: 1, borderBottomColor: '#1e293b',
  },
  title: { color: '#f1f5f9', fontSize: 17, fontWeight: '600' },
  cancel: { color: '#3b82f6', fontSize: 16 },
  searchWrap: { padding: 12, borderBottomWidth: 1, borderBottomColor: '#1e293b' },
  search: {
    backgroundColor: '#1e293b', color: '#f1f5f9', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 10, fontSize: 15,
    borderWidth: 1, borderColor: '#334155',
  },
  item: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#1e293b',
  },
  star: { color: '#fbbf24', fontSize: 14, marginRight: 4 },
  itemText: { color: '#f1f5f9', fontSize: 16 },
  itemNone: { color: '#64748b', fontSize: 16 },
  itemCreate: { color: '#3b82f6', fontSize: 16 },
  sectionHeader: {
    color: '#64748b', fontSize: 11, fontWeight: '700', textTransform: 'uppercase',
    letterSpacing: 1, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#0f172a',
  },
  transferArrow: { color: '#60a5fa', fontSize: 14 },
});
