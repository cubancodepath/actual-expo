import { useCallback, useState } from 'react';
import {
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { usePayeesStore } from '../../src/stores/payeesStore';
import { useUndoStore } from '../../src/stores/undoStore';
import { runQuery, run } from '../../src/db';
import { updateTransaction } from '../../src/transactions';
import type { Payee } from '../../src/payees/types';
import { SearchBar } from '../../src/presentation/components';

// ---------------------------------------------------------------------------
// Merge picker — shown when deleting a payee that has transactions
// ---------------------------------------------------------------------------

function MergePicker({
  visible,
  deletingName,
  candidates,
  onMerge,
  onSkip,
  onCancel,
}: {
  visible: boolean;
  deletingName: string;
  candidates: Payee[];
  onMerge: (targetId: string) => void;
  onSkip: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const filtered = candidates.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.overlay} onPress={onCancel}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <Text style={styles.sheetTitle}>{t('payees.deleteConfirm', { name: deletingName })}</Text>
          <Text style={styles.sheetSubtitle}>
            {t('payees.reassignTransactions')}
          </Text>
          <SearchBar
            value={search}
            onChangeText={setSearch}
            placeholder={t('payees.searchPayees')}
            noMargin
          />
          <ScrollView style={styles.sheetList} bounces={false}>
            {filtered.map(p => (
              <Pressable key={p.id} style={styles.sheetItem} onPress={() => { setSearch(''); onMerge(p.id); }}>
                {p.favorite && <Text style={styles.star}>★ </Text>}
                <Text style={styles.sheetItemText}>{p.name}</Text>
              </Pressable>
            ))}
            {filtered.length === 0 && (
              <Text style={styles.sheetEmpty}>{t('payees.noPayeesFound')}</Text>
            )}
          </ScrollView>
          <View style={styles.sheetActions}>
            <Pressable style={styles.sheetActionBtn} onPress={() => { setSearch(''); onSkip(); }}>
              <Text style={styles.sheetActionSkip}>{t('payees.deleteKeepUnassigned')}</Text>
            </Pressable>
            <Pressable style={styles.sheetActionBtn} onPress={() => { setSearch(''); onCancel(); }}>
              <Text style={styles.sheetActionCancel}>{t('cancel')}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Payee row
// ---------------------------------------------------------------------------

function PayeeRow({
  payee,
  txnCount,
  onToggleFavorite,
  onRename,
  onDelete,
  isLast,
}: {
  payee: Payee;
  txnCount: number;
  onToggleFavorite: (id: string, fav: boolean) => void;
  onRename: (id: string, current: string) => void;
  onDelete: (id: string, name: string) => void;
  isLast?: boolean;
}) {
  const { t } = useTranslation();

  return (
    <View style={styles.row}>
      <Pressable
        style={styles.starBtn}
        onPress={() => onToggleFavorite(payee.id, !payee.favorite)}
        hitSlop={8}
      >
        <Text style={[styles.starIcon, payee.favorite && styles.starActive]}>
          {payee.favorite ? '★' : '☆'}
        </Text>
      </Pressable>

      <Pressable style={styles.nameArea} onPress={() => onRename(payee.id, payee.name)}>
        <Text style={styles.payeeName}>{payee.name}</Text>
        {txnCount > 0 && (
          <Text style={styles.txCount}>{t('payees.transaction', { count: txnCount })}</Text>
        )}
      </Pressable>

      <Pressable style={styles.delBtn} onPress={() => onDelete(payee.id, payee.name)} hitSlop={8}>
        <Text style={styles.delText}>del</Text>
      </Pressable>
      {!isLast && (
        <View style={styles.separator} />
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function PayeesScreen() {
  const { t } = useTranslation();
  const { payees, load, update, delete_ } = usePayeesStore();
  const [search, setSearch] = useState('');
  const [txnCounts, setTxnCounts] = useState<Map<string, number>>(new Map());
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null);

  useFocusEffect(
    useCallback(() => {
      load().then(loadCounts);
    }, []),
  );

  async function loadCounts() {
    const rows = await runQuery<{ description: string; n: number }>(
      `SELECT description, COUNT(*) AS n
       FROM transactions
       WHERE description IS NOT NULL AND tombstone = 0
       GROUP BY description`,
    );
    const map = new Map(rows.map(r => [r.description, r.n]));
    setTxnCounts(map);
  }

  function handleRename(id: string, current: string) {
    Alert.prompt(
      t('payees.renamePayee'),
      undefined,
      async name => {
        if (!name?.trim() || name.trim() === current) return;
        await update(id, { name: name.trim() });
        load();
      },
      'plain-text',
      current,
    );
  }

  async function handleDelete(id: string, name: string) {
    const count = txnCounts.get(id) ?? 0;
    if (count > 0) {
      setPendingDelete({ id, name });
    } else {
      Alert.alert(t('payees.deleteTitle'), t('payees.deleteConfirm', { name }), [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('delete'),
          style: 'destructive',
          onPress: async () => { await delete_(id); load(); loadCounts(); useUndoStore.getState().showUndo(t('payees.payeeDeleted')); },
        },
      ]);
    }
  }

  async function confirmMerge(targetId: string) {
    if (!pendingDelete) return;
    const { id } = pendingDelete;
    // Reassign all transactions from deleted payee → target payee via CRDT messages
    const txns = await runQuery<{ id: string }>(
      'SELECT id FROM transactions WHERE description = ? AND tombstone = 0',
      [id],
    );
    for (const t of txns) {
      await updateTransaction(t.id, { description: targetId });
    }
    await delete_(id);
    setPendingDelete(null);
    load();
    loadCounts();
    useUndoStore.getState().showUndo(t('payees.payeeDeleted'));
  }

  async function confirmDeleteNoMerge() {
    if (!pendingDelete) return;
    await delete_(pendingDelete.id);
    setPendingDelete(null);
    load();
    loadCounts();
    useUndoStore.getState().showUndo(t('payees.payeeDeleted'));
  }

  // Sort: favorites first, then alphabetical
  const filtered = payees
    .filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

  const mergeCandidates = payees.filter(p => p.id !== pendingDelete?.id);

  const router = useRouter();

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          headerLeft: () => (
            <Pressable onPress={() => router.back()} hitSlop={8}>
              <Ionicons name="close" size={22} color="#999" />
            </Pressable>
          ),
        }}
      />
      <MergePicker
        visible={pendingDelete !== null}
        deletingName={pendingDelete?.name ?? ''}
        candidates={mergeCandidates}
        onMerge={confirmMerge}
        onSkip={confirmDeleteNoMerge}
        onCancel={() => setPendingDelete(null)}
      />

      <SearchBar
        value={search}
        onChangeText={setSearch}
        placeholder={t('payees.searchPayees')}
        returnKeyType="search"
      />

      <FlatList
        data={filtered}
        keyExtractor={p => p.id}
        renderItem={({ item, index }) => (
          <PayeeRow
            payee={item}
            txnCount={txnCounts.get(item.id) ?? 0}
            onToggleFavorite={async (id, fav) => { await update(id, { favorite: fav }); load(); }}
            onRename={handleRename}
            onDelete={handleDelete}
            isLast={index === filtered.length - 1}
          />
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>
              {search ? t('payees.noPayeesMatch') : t('payees.noPayeesYet')}
            </Text>
            <Text style={styles.emptyHint}>{t('payees.payeesCreatedHint')}</Text>
          </View>
        }
        contentContainerStyle={{ paddingBottom: 60 }}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#0f172a',
  },
  starBtn: { paddingRight: 12 },
  starIcon: { fontSize: 18, color: '#334155' },
  starActive: { color: '#fbbf24' },
  nameArea: { flex: 1 },
  payeeName: { color: '#f1f5f9', fontSize: 15 },
  txCount: { color: '#475569', fontSize: 12, marginTop: 2 },
  delBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: '#1e293b',
    marginLeft: 8,
  },
  delText: { color: '#f87171', fontSize: 11, fontWeight: '700' },

  separator: { position: 'absolute' as const, bottom: 0, left: 52, right: 16, height: 1, backgroundColor: '#1e293b' },

  empty: { alignItems: 'center', marginTop: 80, gap: 8, paddingHorizontal: 32 },
  emptyText: { color: '#94a3b8', fontSize: 16, fontWeight: '600', textAlign: 'center' },
  emptyHint: { color: '#475569', fontSize: 13, textAlign: 'center' },

  // Merge picker
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#1e293b',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 20,
    paddingHorizontal: 16,
    paddingBottom: 36,
    maxHeight: '75%',
  },
  sheetTitle: { color: '#f1f5f9', fontSize: 16, fontWeight: '700', marginBottom: 4 },
  sheetSubtitle: { color: '#94a3b8', fontSize: 13, marginBottom: 10 },
  sheetList: { maxHeight: 280 },
  sheetItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  star: { color: '#fbbf24', fontSize: 14 },
  sheetItemText: { color: '#e2e8f0', fontSize: 15 },
  sheetEmpty: { color: '#475569', fontSize: 13, paddingVertical: 16, textAlign: 'center' },
  sheetActions: { marginTop: 10, gap: 2 },
  sheetActionBtn: { paddingVertical: 12, alignItems: 'center' },
  sheetActionSkip: { color: '#f87171', fontSize: 14, fontWeight: '600' },
  sheetActionCancel: { color: '#64748b', fontSize: 14 },
});
