import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { usePrefsStore } from '../../../src/stores/prefsStore';
import { useSyncStore } from '../../../src/stores/syncStore';

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue} numberOfLines={1}>{value || '—'}</Text>
    </View>
  );
}

export default function SettingsScreen() {
  const { serverUrl, fileId, groupId, encryptKeyId, lastSyncedTimestamp, clearAll } = usePrefsStore();
  const { status, error, lastSync, sync } = useSyncStore();
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    Alert.alert(
      'Disconnect',
      'Disconnect from this server? Your local data will remain.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: async () => {
            setLoggingOut(true);
            try {
              await clearAll(); // wipes MMKV + SecureStore, isConfigured → false
            } finally {
              setLoggingOut(false);
            }
          },
        },
      ],
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 60 }}>
      <Text style={styles.sectionTitle}>Server</Text>
      <View style={styles.card}>
        <Row label="URL" value={serverUrl} />
        <Row label="File ID" value={fileId ? `${fileId.slice(0, 8)}…` : ''} />
        <Row label="Group ID" value={groupId ? `${groupId.slice(0, 8)}…` : ''} />
        {encryptKeyId && <Row label="Encryption key" value={`${encryptKeyId.slice(0, 8)}…`} />}
      </View>

      <Text style={styles.sectionTitle}>Sync</Text>
      <View style={styles.card}>
        <Row
          label="Last sync"
          value={lastSync ? lastSync.toLocaleTimeString() : (lastSyncedTimestamp ? lastSyncedTimestamp.slice(0, 16) : 'Never')}
        />
        {error && <Text style={styles.errorText}>{error}</Text>}
        <Pressable
          style={[styles.syncButton, (status === 'syncing') && styles.buttonDisabled]}
          onPress={sync}
          disabled={status === 'syncing'}
        >
          {status === 'syncing'
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.syncButtonText}>
                {status === 'success' ? 'Sync again' : status === 'error' ? 'Retry sync' : 'Sync now'}
              </Text>
          }
        </Pressable>
      </View>

      <Pressable
        style={[styles.logoutButton, loggingOut && styles.buttonDisabled]}
        onPress={handleLogout}
        disabled={loggingOut}
      >
        <Text style={styles.logoutText}>Disconnect from server</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a', paddingHorizontal: 16, paddingTop: 12 },
  sectionTitle: {
    color: '#64748b', fontSize: 11, fontWeight: '700', textTransform: 'uppercase',
    letterSpacing: 1, marginTop: 20, marginBottom: 8,
  },
  card: { backgroundColor: '#1e293b', borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#334155' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14, borderBottomWidth: 1, borderBottomColor: '#334155' },
  rowLabel: { color: '#94a3b8', fontSize: 14 },
  rowValue: { color: '#f1f5f9', fontSize: 13, fontFamily: 'monospace', flex: 1, textAlign: 'right', marginLeft: 8 },
  errorText: { color: '#f87171', fontSize: 12, padding: 12 },
  syncButton: {
    backgroundColor: '#1d4ed8',
    margin: 12,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  syncButtonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  buttonDisabled: { opacity: 0.5 },
  logoutButton: {
    marginTop: 32,
    backgroundColor: '#7f1d1d',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  logoutText: { color: '#fca5a5', fontWeight: '700', fontSize: 15 },
});
