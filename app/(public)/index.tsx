import { useRef, useState } from 'react';
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
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import {
  getBootstrapInfo,
  login,
  initiateOpenIdLogin,
  type LoginMethod,
} from '../../src/services/authService';
import { usePrefsStore } from '../../src/stores/prefsStore';

// Required for Android to properly complete the auth session
WebBrowser.maybeCompleteAuthSession();

export default function LoginScreen() {
  const router = useRouter();
  const { setPrefs, saveToken } = usePrefsStore();

  const [serverUrl, setServerUrl] = useState('');
  const [password, setPassword] = useState('');

  // 'idle'    → haven't probed the server yet
  // 'probing' → calling /account/needs-bootstrap
  // 'password' | 'openid' → server answered, show the correct form
  const [step, setStep] = useState<'idle' | 'probing' | LoginMethod>('idle');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const urlRef = useRef('');

  // -------------------------------------------------------------------------
  // Step 1 — probe the server
  // -------------------------------------------------------------------------
  async function handleProbe() {
    const url = serverUrl.trim().replace(/\/$/, '');
    if (!url) { setError('Server URL is required'); return; }

    setError(null);
    setStep('probing');
    try {
      const info = await getBootstrapInfo(url);
      urlRef.current = url;

      if (!info.bootstrapped) {
        setError('This server is not set up yet. Configure it via the web app first.');
        setStep('idle');
        return;
      }

      setStep(info.loginMethod);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setStep('idle');
    }
  }

  // -------------------------------------------------------------------------
  // Step 2a — password login
  // -------------------------------------------------------------------------
  async function handlePasswordLogin() {
    setError(null);
    setLoading(true);
    try {
      const token = await login(urlRef.current, password.trim());
      setPrefs({ serverUrl: urlRef.current });
      await saveToken(token);
      router.push('/(public)/files');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  // -------------------------------------------------------------------------
  // Step 2b — OpenID login
  //
  // Flow:
  //  1. POST /account/login { loginMethod: 'openid', returnUrl } → authUrl
  //  2. openAuthSessionAsync(authUrl, callbackUrl) opens an in-app browser
  //  3. Server handles PKCE, redirects to {returnUrl}/openid-cb?token=xxx
  //  4. The system intercepts our custom scheme and returns the URL directly
  //  5. We extract the token and navigate to files
  // -------------------------------------------------------------------------
  async function handleOpenIdLogin() {
    setError(null);
    setLoading(true);
    try {
      const serverUrl = urlRef.current;

      // The server validates returnUrl with:
      //   new URL(returnUrl).hostname === serverHostname  ||  hostname === 'localhost'
      //
      // Custom schemes like actualbudget://openid-cb fail because their
      // hostname is 'openid-cb', not the server's.
      //
      // Trick: use our custom scheme but mirror the server's hostname:
      //   actualbudget://actual.cubancodelab.net
      //   → new URL(...).hostname = 'actual.cubancodelab.net'  ✓ passes!
      //
      // The server then redirects to:
      //   actualbudget://actual.cubancodelab.net/openid-cb?token=xxx
      //
      // openAuthSessionAsync extracts scheme 'actualbudget' and iOS/Android
      // intercept that redirect natively — no Universal Links needed.
      const appScheme = 'actualbudget';
      const serverHostname = new URL(serverUrl).hostname;
      const returnUrl = `${appScheme}://${serverHostname}`;
      const callbackUrl = `${returnUrl}/openid-cb`;

      const authUrl = await initiateOpenIdLogin(serverUrl, returnUrl);

      const result = await WebBrowser.openAuthSessionAsync(authUrl, callbackUrl);

      if (result.type !== 'success') {
        setLoading(false);
        return;
      }

      // result.url = 'actualbudget://actual.cubancodelab.net/openid-cb?token=xxx'
      const parsed = Linking.parse(result.url);
      const token = parsed.queryParams?.token as string | undefined;
      if (!token) {
        setError('OpenID callback did not include a token');
        setLoading(false);
        return;
      }

      setPrefs({ serverUrl });
      await saveToken(token);
      router.replace('/(public)/files');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setLoading(false);
    }
  }

  function handleChangeServer() {
    setStep('idle');
    setPassword('');
    setError(null);
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
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
          {/* ── Server URL ── */}
          <Text style={styles.label}>Server URL</Text>
          <View style={styles.urlRow}>
            <TextInput
              style={[styles.input, styles.urlInput, step !== 'idle' && step !== 'probing' && styles.inputLocked]}
              placeholder="https://budget.example.com"
              placeholderTextColor="#64748b"
              value={serverUrl}
              onChangeText={v => { setServerUrl(v); setStep('idle'); setError(null); }}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              returnKeyType="go"
              onSubmitEditing={step === 'idle' ? handleProbe : undefined}
              editable={step === 'idle' || step === 'probing'}
            />
            {step !== 'idle' && step !== 'probing' && (
              <Pressable style={styles.changeBtn} onPress={handleChangeServer} hitSlop={8}>
                <Text style={styles.changeBtnText}>Change</Text>
              </Pressable>
            )}
          </View>

          {/* ── Probing ── */}
          {step === 'probing' && (
            <View style={styles.probingRow}>
              <ActivityIndicator size="small" color="#3b82f6" />
              <Text style={styles.probingText}>Connecting to server…</Text>
            </View>
          )}

          {/* ── Password form ── */}
          {step === 'password' && (
            <>
              <Text style={styles.label}>Password</Text>
              <TextInput
                style={styles.input}
                placeholder="Server password"
                placeholderTextColor="#64748b"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoCapitalize="none"
                autoFocus
                returnKeyType="go"
                onSubmitEditing={handlePasswordLogin}
              />
            </>
          )}

          {/* ── OpenID info banner ── */}
          {step === 'openid' && (
            <View style={styles.openIdBanner}>
              <Text style={styles.openIdBannerTitle}>OpenID Connect</Text>
              <Text style={styles.openIdBannerText}>
                You'll be redirected to your identity provider to sign in securely.
              </Text>
            </View>
          )}

          {error && <Text style={styles.error}>{error}</Text>}

          {/* ── Action button ── */}
          {step === 'idle' && (
            <Pressable style={styles.button} onPress={handleProbe}>
              <Text style={styles.buttonText}>Continue</Text>
            </Pressable>
          )}

          {step === 'password' && (
            <Pressable
              style={[styles.button, (!password || loading) && styles.buttonDisabled]}
              onPress={handlePasswordLogin}
              disabled={!password || loading}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.buttonText}>Connect</Text>
              }
            </Pressable>
          )}

          {step === 'openid' && (
            <Pressable
              style={[styles.button, styles.buttonOpenId, loading && styles.buttonDisabled]}
              onPress={handleOpenIdLogin}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.buttonText}>Sign in with OpenID</Text>
              }
            </Pressable>
          )}
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
  label: {
    color: '#94a3b8', fontSize: 12, fontWeight: '600',
    textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 8,
  },
  input: {
    backgroundColor: '#1e293b', color: '#f1f5f9', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 14, fontSize: 16,
    borderWidth: 1, borderColor: '#334155',
  },
  inputLocked: { opacity: 0.55 },

  urlRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  urlInput: { flex: 1 },
  changeBtn: {
    backgroundColor: '#1e293b', borderRadius: 8, borderWidth: 1,
    borderColor: '#334155', paddingHorizontal: 12, paddingVertical: 14,
  },
  changeBtnText: { color: '#3b82f6', fontSize: 13, fontWeight: '600' },

  probingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
  probingText: { color: '#64748b', fontSize: 14 },

  openIdBanner: {
    backgroundColor: '#0f2d5e', borderRadius: 10, borderWidth: 1,
    borderColor: '#1d4ed8', padding: 14, marginTop: 8, gap: 6,
  },
  openIdBannerTitle: { color: '#93c5fd', fontSize: 14, fontWeight: '700' },
  openIdBannerText: { color: '#60a5fa', fontSize: 13, lineHeight: 18 },

  error: { color: '#f87171', fontSize: 13, marginTop: 4 },

  button: {
    backgroundColor: '#3b82f6', borderRadius: 10,
    paddingVertical: 16, alignItems: 'center', marginTop: 16,
  },
  buttonOpenId: { backgroundColor: '#1d4ed8' },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
