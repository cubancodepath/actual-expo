import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { login } from '../../src/services/authService';
import { usePrefsStore } from '../../src/stores/prefsStore';

export default function LoginScreen() {
  const router = useRouter();
  const setPrefs = usePrefsStore(s => s.setPrefs);
  const saveToStorage = usePrefsStore(s => s.saveToStorage);

  const [serverUrl, setServerUrl] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConnect() {
    const url = serverUrl.trim().replace(/\/$/, '');
    if (!url) { setError('Server URL is required'); return; }

    setError(null);
    setLoading(true);
    try {
      const token = await login(url, password.trim());
      setPrefs({ serverUrl: url, token });
      await saveToStorage();
      router.push('/(public)/files');
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
        <View style={styles.header}>
          <Text style={styles.logo}>actual</Text>
          <Text style={styles.tagline}>Open source personal finance</Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>Server URL</Text>
          <TextInput
            style={styles.input}
            placeholder="https://budget.example.com"
            placeholderTextColor="#64748b"
            value={serverUrl}
            onChangeText={setServerUrl}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />

          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            placeholder="Server password"
            placeholderTextColor="#64748b"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
          />

          {error && <Text style={styles.error}>{error}</Text>}

          <Pressable
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleConnect}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.buttonText}>Connect</Text>
            }
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#0f172a' },
  container: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 80, paddingBottom: 40 },
  header: { alignItems: 'center', marginBottom: 48 },
  logo: { fontSize: 40, fontWeight: '800', color: '#f1f5f9', letterSpacing: -1 },
  tagline: { fontSize: 14, color: '#64748b', marginTop: 6 },
  form: { gap: 8 },
  label: { color: '#94a3b8', fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 8 },
  input: {
    backgroundColor: '#1e293b',
    color: '#f1f5f9',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  error: { color: '#f87171', fontSize: 13, marginTop: 4 },
  button: {
    backgroundColor: '#3b82f6',
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 16,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
