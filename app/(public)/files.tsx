import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { usePrefsStore } from '../../src/stores/prefsStore';
import { listFiles, type BudgetFile } from '../../src/services/authService';
import { downloadAndImportBudget } from '../../src/services/budgetfiles';
import { fullSync } from '../../src/sync';

export default function FilesScreen() {
  const router = useRouter();
  const { serverUrl, token, setPrefs } = usePrefsStore();
  const [files, setFiles] = useState<BudgetFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selecting, setSelecting] = useState<string | null>(null);

  useEffect(() => {
    listFiles(serverUrl, token)
      .then(setFiles)
      .catch(e => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [serverUrl, token]);

  async function handleSelect(file: BudgetFile) {
    setSelecting(file.fileId);
    try {
      await downloadAndImportBudget(serverUrl, token, file.fileId, file.encryptKeyId);
      setPrefs({ fileId: file.fileId, groupId: file.groupId, encryptKeyId: file.encryptKeyId, lastSyncedTimestamp: undefined });

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

      fullSync().catch(console.warn);
      router.replace('/(auth)/(tabs)/budget');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setSelecting(null);
    }
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
      <View style={styles.header}>
        <Text style={styles.title}>Select a budget</Text>
        <Text style={styles.subtitle}>{files.length} file{files.length !== 1 ? 's' : ''} found</Text>
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
          </View>
        }
        contentContainerStyle={{ paddingBottom: 40 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a', paddingTop: 16, paddingHorizontal: 16 },
  center: { flex: 1, backgroundColor: '#0f172a', alignItems: 'center', justifyContent: 'center', gap: 12 },

  header: { marginBottom: 20 },
  title: { fontSize: 22, fontWeight: '700', color: '#f1f5f9', marginBottom: 4 },
  subtitle: { fontSize: 13, color: '#64748b' },

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

  emptyWrap: { alignItems: 'center', marginTop: 40 },
  empty: { color: '#64748b', textAlign: 'center', fontSize: 15 },

  hint: { color: '#64748b', marginTop: 12 },
  error: { color: '#f87171', fontSize: 14, textAlign: 'center', paddingHorizontal: 24 },
});
