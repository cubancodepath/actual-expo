import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useAccountsStore } from '../../../src/stores/accountsStore';

function formatBalance(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  return `${sign}$${(Math.abs(cents) / 100).toFixed(2)}`;
}

export default function AccountDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();
  const router = useRouter();
  const { accounts, update, close, delete_, load } = useAccountsStore();

  const account = accounts.find(a => a.id === id);

  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(account?.name ?? '');
  const [saving, setSaving] = useState(false);
  const nameInputRef = useRef<TextInput>(null);

  // Sync nameValue if account reloads
  useEffect(() => {
    if (account && !editingName) setNameValue(account.name);
  }, [account?.name]);

  // Set header title to account name
  useLayoutEffect(() => {
    navigation.setOptions({ title: account?.name ?? 'Account' });
  }, [account?.name]);

  if (!account) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#3b82f6" />
      </View>
    );
  }

  async function saveName() {
    const trimmed = nameValue.trim();
    if (!trimmed || trimmed === account!.name) { setEditingName(false); return; }
    setSaving(true);
    try {
      await update(id, { name: trimmed });
      await load();
    } finally {
      setSaving(false);
      setEditingName(false);
    }
  }

  async function toggleOffBudget(value: boolean) {
    setSaving(true);
    try {
      await update(id, { offbudget: value });
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function handleClose() {
    Alert.alert(
      account!.closed ? 'Reopen Account' : 'Close Account',
      account!.closed
        ? 'Reopen this account? It will appear in your budget again.'
        : 'Close this account? It will be hidden but transactions are kept.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: account!.closed ? 'Reopen' : 'Close',
          onPress: async () => {
            setSaving(true);
            try {
              await update(id, { closed: !account!.closed });
              await load();
            } finally {
              setSaving(false);
            }
          },
        },
      ],
    );
  }

  async function handleDelete() {
    Alert.alert(
      'Delete Account',
      'Permanently delete this account and all its transactions? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setSaving(true);
            try {
              await delete_(id);
              await load();
              router.back();
            } finally {
              setSaving(false);
            }
          },
        },
      ],
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 60 }}>

      {/* Balance */}
      <View style={styles.balanceCard}>
        <Text style={styles.balanceLabel}>Current Balance</Text>
        <Text style={[styles.balance, (account.balance ?? 0) < 0 && styles.negative]}>
          {formatBalance(account.balance ?? 0)}
        </Text>
      </View>

      {/* Name */}
      <Text style={styles.sectionTitle}>Details</Text>
      <View style={styles.card}>
        <Pressable
          style={styles.row}
          onPress={() => {
            setEditingName(true);
            setTimeout(() => nameInputRef.current?.focus(), 50);
          }}
        >
          <Text style={styles.rowLabel}>Name</Text>
          {editingName ? (
            <View style={styles.nameInputRow}>
              <TextInput
                ref={nameInputRef}
                style={styles.nameInput}
                value={nameValue}
                onChangeText={setNameValue}
                onBlur={saveName}
                onSubmitEditing={saveName}
                returnKeyType="done"
                selectTextOnFocus
              />
              {saving && <ActivityIndicator size="small" color="#3b82f6" style={{ marginLeft: 8 }} />}
            </View>
          ) : (
            <Text style={styles.rowValue}>{account.name}</Text>
          )}
        </Pressable>

        <View style={[styles.row, styles.rowBorderTop]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowLabel}>Off budget</Text>
            <Text style={styles.rowHint}>Won't affect your budget envelopes</Text>
          </View>
          <Switch
            value={account.offbudget}
            onValueChange={toggleOffBudget}
            disabled={saving}
            trackColor={{ false: '#334155', true: '#1d4ed8' }}
            thumbColor={account.offbudget ? '#93c5fd' : '#64748b'}
          />
        </View>
      </View>

      {/* Actions */}
      <Text style={styles.sectionTitle}>Actions</Text>
      <View style={styles.card}>
        <Pressable style={styles.row} onPress={handleClose} disabled={saving}>
          <Text style={[styles.rowLabel, styles.actionText]}>
            {account.closed ? 'Reopen account' : 'Close account'}
          </Text>
        </Pressable>
      </View>

      <Pressable
        style={[styles.deleteButton, saving && { opacity: 0.5 }]}
        onPress={handleDelete}
        disabled={saving}
      >
        <Text style={styles.deleteText}>Delete Account</Text>
      </Pressable>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a', paddingHorizontal: 16, paddingTop: 12 },
  center: { flex: 1, backgroundColor: '#0f172a', alignItems: 'center', justifyContent: 'center' },

  balanceCard: {
    backgroundColor: '#1e293b', borderRadius: 12, padding: 20,
    alignItems: 'center', marginBottom: 24,
    borderWidth: 1, borderColor: '#334155',
  },
  balanceLabel: { color: '#64748b', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 },
  balance: { color: '#4ade80', fontSize: 32, fontWeight: '700' },
  negative: { color: '#f87171' },

  sectionTitle: {
    color: '#64748b', fontSize: 11, fontWeight: '700',
    textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, marginTop: 4,
  },
  card: { backgroundColor: '#1e293b', borderRadius: 12, borderWidth: 1, borderColor: '#334155', marginBottom: 16, overflow: 'hidden' },

  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14 },
  rowBorderTop: { borderTopWidth: 1, borderTopColor: '#334155' },
  rowLabel: { color: '#94a3b8', fontSize: 14 },
  rowHint: { color: '#475569', fontSize: 11, marginTop: 2 },
  rowValue: { color: '#f1f5f9', fontSize: 15, fontWeight: '500' },

  nameInputRow: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end' },
  nameInput: {
    flex: 1, color: '#f1f5f9', fontSize: 15, fontWeight: '500',
    textAlign: 'right', padding: 0,
  },

  actionText: { color: '#f1f5f9', fontSize: 15 },

  deleteButton: {
    backgroundColor: '#7f1d1d', borderRadius: 12,
    paddingVertical: 16, alignItems: 'center', marginTop: 8,
  },
  deleteText: { color: '#fca5a5', fontWeight: '700', fontSize: 15 },
});
