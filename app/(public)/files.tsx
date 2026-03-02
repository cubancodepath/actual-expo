import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { usePrefsStore } from '../../src/stores/prefsStore';
import { listFiles, type BudgetFile } from '../../src/services/authService';
import { createNewBudget, downloadAndImportBudget } from '../../src/services/budgetfiles';
import { fullSync } from '../../src/sync';

export default function FilesScreen() {
  const { serverUrl, token, setPrefs } = usePrefsStore();
  const [files, setFiles] = useState<BudgetFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selecting, setSelecting] = useState<string | null>(null);

  // Create budget modal state
  const [createVisible, setCreateVisible] = useState(false);
  const [budgetName, setBudgetName] = useState('My Budget');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    listFiles(serverUrl, token)
      .then(setFiles)
      .catch(e => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [serverUrl, token]);

  async function connectToFile(fileId: string, groupId: string, encryptKeyId?: string) {
    setPrefs({ fileId, groupId, encryptKeyId, lastSyncedTimestamp: undefined });

    const [
      { useAccountsStore },
      { useCategoriesStore },
      { useBudgetStore },
    ] = await Promise.all([
      import('../../src/stores/accountsStore'),
      import('../../src/stores/categoriesStore'),
      import('../../src/stores/budgetStore'),
    ]);
    await Promise.allSettled([
      useAccountsStore.getState().load(),
      useCategoriesStore.getState().load(),
      useBudgetStore.getState().load(),
    ]);

    await fullSync();
  }

  async function handleSelect(file: BudgetFile) {
    setSelecting(file.fileId);
    try {
      await downloadAndImportBudget(serverUrl, token, file.fileId, file.encryptKeyId);
      await connectToFile(file.fileId, file.groupId, file.encryptKeyId);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setSelecting(null);
    }
  }

  async function handleCreate() {
    const name = budgetName.trim() || 'My Budget';
    setCreating(true);
    setCreateError(null);
    try {
      const { fileId, groupId } = await createNewBudget(serverUrl, token, name);
      setCreateVisible(false);
      await connectToFile(fileId, groupId);
    } catch (e: unknown) {
      setCreateError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  }

  function openCreateModal() {
    setBudgetName('My Budget');
    setCreateError(null);
    setCreateVisible(true);
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#3b82f6" size="large" />
        <Text style={styles.hint}>Loading budget files…</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header row */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Select a budget</Text>
          <Text style={styles.subtitle}>{files.length} file{files.length !== 1 ? 's' : ''} found</Text>
        </View>
        <Pressable
          style={[styles.newBtn, selecting !== null && styles.newBtnDisabled]}
          onPress={openCreateModal}
          disabled={selecting !== null}
        >
          <Text style={styles.newBtnText}>+ New</Text>
        </Pressable>
      </View>

      <FlatList
        data={files}
        keyExtractor={f => f.fileId}
        renderItem={({ item }) => (
          <Pressable
            style={[styles.card, selecting === item.fileId && styles.cardSelected]}
            onPress={() => handleSelect(item)}
            disabled={selecting !== null}
          >
            <View style={styles.cardRow}>
              <View style={styles.cardInfo}>
                <Text style={styles.fileName}>{item.name || 'Unnamed budget'}</Text>
                <Text style={styles.fileId}>{item.fileId.slice(0, 8)}…</Text>
              </View>
              {item.encryptKeyId && (
                <Text style={styles.badge}>Encrypted</Text>
              )}
              {selecting === item.fileId && (
                <ActivityIndicator color="#3b82f6" style={{ marginLeft: 8 }} />
              )}
            </View>
          </Pressable>
        )}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Text style={styles.empty}>No budget files found on this server.</Text>
            <Text style={styles.emptyHint}>Tap "+ New" to create your first budget.</Text>
          </View>
        }
        contentContainerStyle={{ paddingBottom: 40 }}
      />

      {/* Create Budget Modal */}
      <Modal
        visible={createVisible}
        transparent
        animationType="fade"
        onRequestClose={() => { if (!creating) setCreateVisible(false); }}
      >
        <KeyboardAvoidingView
          style={modal.overlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Pressable style={modal.backdrop} onPress={() => { if (!creating) setCreateVisible(false); }} />
          <View style={modal.sheet}>
            <Text style={modal.title}>New Budget</Text>
            <Text style={modal.label}>Budget Name</Text>
            <TextInput
              style={modal.input}
              value={budgetName}
              onChangeText={setBudgetName}
              placeholder="My Budget"
              placeholderTextColor="#475569"
              autoFocus
              selectTextOnFocus
              returnKeyType="done"
              onSubmitEditing={handleCreate}
              editable={!creating}
            />

            {createError && (
              <Text style={modal.error}>{createError}</Text>
            )}

            <View style={modal.actions}>
              <Pressable
                style={[modal.cancelBtn, creating && modal.btnDisabled]}
                onPress={() => setCreateVisible(false)}
                disabled={creating}
              >
                <Text style={modal.cancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[modal.createBtn, (!budgetName.trim() || creating) && modal.btnDisabled]}
                onPress={handleCreate}
                disabled={!budgetName.trim() || creating}
              >
                {creating
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={modal.createText}>Create</Text>
                }
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a', paddingTop: 16, paddingHorizontal: 16 },
  center: { flex: 1, backgroundColor: '#0f172a', alignItems: 'center', justifyContent: 'center', gap: 12 },

  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    marginBottom: 20,
  },
  title: { fontSize: 22, fontWeight: '700', color: '#f1f5f9', marginBottom: 4 },
  subtitle: { fontSize: 13, color: '#64748b' },
  newBtn: {
    backgroundColor: '#3b82f6', borderRadius: 8,
    paddingHorizontal: 14, paddingVertical: 8,
    alignSelf: 'center',
  },
  newBtnDisabled: { opacity: 0.4 },
  newBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  card: {
    backgroundColor: '#1e293b', borderRadius: 10, padding: 16, marginBottom: 10,
    borderWidth: 1, borderColor: '#334155',
  },
  cardSelected: { borderColor: '#3b82f6' },
  cardRow: { flexDirection: 'row', alignItems: 'center' },
  cardInfo: { flex: 1 },
  fileName: { fontSize: 16, fontWeight: '600', color: '#f1f5f9' },
  fileId: { fontSize: 11, color: '#64748b', fontFamily: 'monospace', marginTop: 2 },
  badge: {
    fontSize: 10, fontWeight: '700', color: '#fbbf24',
    backgroundColor: '#451a03', paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 6, overflow: 'hidden',
  },

  emptyWrap: { alignItems: 'center', marginTop: 40, gap: 8 },
  empty: { color: '#64748b', textAlign: 'center', fontSize: 15 },
  emptyHint: { color: '#475569', textAlign: 'center', fontSize: 13 },

  hint: { color: '#64748b', marginTop: 12 },
  error: { color: '#f87171', fontSize: 14, textAlign: 'center', paddingHorizontal: 24 },
});

const modal = StyleSheet.create({
  overlay: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  sheet: {
    backgroundColor: '#1e293b', borderRadius: 16, padding: 24,
    width: '88%', borderWidth: 1, borderColor: '#334155',
    zIndex: 1,
  },
  title: { color: '#f1f5f9', fontSize: 18, fontWeight: '700', marginBottom: 20 },
  label: {
    color: '#94a3b8', fontSize: 11, fontWeight: '700',
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6,
  },
  input: {
    backgroundColor: '#0f172a', color: '#f1f5f9', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 14, fontSize: 16,
    borderWidth: 1, borderColor: '#334155', marginBottom: 16,
  },
  error: { color: '#f87171', fontSize: 13, marginBottom: 12 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  cancelBtn: {
    flex: 1, paddingVertical: 14, alignItems: 'center',
    borderRadius: 10, borderWidth: 1, borderColor: '#334155',
  },
  cancelText: { color: '#94a3b8', fontSize: 15, fontWeight: '600' },
  createBtn: {
    flex: 1, paddingVertical: 14, alignItems: 'center',
    borderRadius: 10, backgroundColor: '#3b82f6',
  },
  createText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  btnDisabled: { opacity: 0.4 },
});
