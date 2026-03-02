import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAccountsStore } from '../../../src/stores/accountsStore';

/** Parse a user-typed balance string like "1,234.56" or "-50" into cents */
function parseToCents(raw: string): number {
  const cleaned = raw.replace(/[^0-9.\-]/g, '');
  const num = parseFloat(cleaned);
  if (isNaN(num)) return 0;
  return Math.round(num * 100);
}

export default function NewAccountScreen() {
  const router = useRouter();
  const { create, load } = useAccountsStore();

  const [name, setName] = useState('');
  const [balanceStr, setBalanceStr] = useState('');
  const [offbudget, setOffbudget] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    const trimmed = name.trim();
    if (!trimmed) { setError('Account name is required'); return; }

    setError(null);
    setLoading(true);
    try {
      const startingBalance = parseToCents(balanceStr);
      await create({ name: trimmed, offbudget, closed: false }, startingBalance);
      await load();
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

        <Text style={styles.label}>Account name</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Checking, Savings, Cash"
          placeholderTextColor="#475569"
          value={name}
          onChangeText={t => { setName(t); setError(null); }}
          autoFocus
          returnKeyType="next"
        />

        <Text style={styles.label}>Starting balance</Text>
        <View style={styles.balanceRow}>
          <Text style={styles.currency}>$</Text>
          <TextInput
            style={[styles.input, styles.balanceInput]}
            placeholder="0.00"
            placeholderTextColor="#475569"
            value={balanceStr}
            onChangeText={setBalanceStr}
            keyboardType="decimal-pad"
            returnKeyType="done"
            onSubmitEditing={handleCreate}
          />
        </View>
        <Text style={styles.hint}>
          Leave blank or 0 to start with an empty account.
          Use a negative value for an account already in debt.
        </Text>

        <View style={styles.row}>
          <View style={styles.rowText}>
            <Text style={styles.rowLabel}>Off budget</Text>
            <Text style={styles.rowHint}>Transactions won't affect your budget</Text>
          </View>
          <Switch
            value={offbudget}
            onValueChange={setOffbudget}
            trackColor={{ false: '#334155', true: '#1d4ed8' }}
            thumbColor={offbudget ? '#93c5fd' : '#64748b'}
          />
        </View>

        {error && <Text style={styles.error}>{error}</Text>}

        <Pressable
          style={[styles.button, (!name.trim() || loading) && styles.buttonDisabled]}
          onPress={handleCreate}
          disabled={!name.trim() || loading}
        >
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.buttonText}>Create Account</Text>
          }
        </Pressable>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#0f172a' },
  container: { padding: 20, gap: 8 },
  label: {
    color: '#94a3b8', fontSize: 12, fontWeight: '700',
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4, marginTop: 8,
  },
  input: {
    backgroundColor: '#1e293b', color: '#f1f5f9', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 14, fontSize: 16,
    borderWidth: 1, borderColor: '#334155',
  },
  balanceRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  currency: { color: '#94a3b8', fontSize: 20, fontWeight: '600' },
  balanceInput: { flex: 1 },
  hint: { color: '#475569', fontSize: 12, lineHeight: 18 },
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#1e293b', borderRadius: 10, padding: 14,
    borderWidth: 1, borderColor: '#334155', marginTop: 8,
  },
  rowText: { flex: 1, marginRight: 12 },
  rowLabel: { color: '#f1f5f9', fontSize: 15, fontWeight: '500' },
  rowHint: { color: '#64748b', fontSize: 12, marginTop: 2 },
  error: { color: '#f87171', fontSize: 13 },
  button: {
    backgroundColor: '#3b82f6', borderRadius: 10,
    paddingVertical: 16, alignItems: 'center', marginTop: 16,
  },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
