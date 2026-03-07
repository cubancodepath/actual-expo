import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import Constants from 'expo-constants';
import {
  getBootstrapInfo,
  login,
  initiateOpenIdLogin,
  type LoginMethod,
} from '../../src/services/authService';
import { usePrefsStore } from '../../src/stores/prefsStore';
import { useTheme, useThemedStyles } from '../../src/presentation/providers/ThemeProvider';
import { Text } from '../../src/presentation/components/atoms/Text';
import { Button } from '../../src/presentation/components/atoms/Button';
import { Banner } from '../../src/presentation/components/molecules/Banner';
import type { Theme } from '../../src/theme';

WebBrowser.maybeCompleteAuthSession();

export default function LoginScreen() {
  const router = useRouter();
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);
  const { setPrefs, saveToken } = usePrefsStore();
  const hasSeenOnboarding = usePrefsStore((s) => s.hasSeenOnboarding);

  useEffect(() => {
    if (!hasSeenOnboarding) {
      router.replace('/(public)/onboarding');
    }
  }, [hasSeenOnboarding]);

  const [serverUrl, setServerUrl] = useState('');
  const [password, setPassword] = useState('');
  const [step, setStep] = useState<'idle' | 'probing' | LoginMethod>('idle');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const urlRef = useRef('');

  // ── Step 1: Probe server ──────────────────────────────────────────────────
  async function probeWithRetry(url: string) {
    // iOS shows a Local Network permission dialog on first access.
    // The user may take several seconds to tap "Allow", so we retry
    // a few times with increasing delays before giving up.
    const retryDelays = [1500, 2500, 3000];
    let lastError: unknown;

    try {
      return await getBootstrapInfo(url);
    } catch (e) {
      lastError = e;
    }

    for (const delay of retryDelays) {
      await new Promise(r => setTimeout(r, delay));
      try {
        return await getBootstrapInfo(url);
      } catch (e) {
        lastError = e;
      }
    }

    throw lastError;
  }

  async function handleProbe() {
    const url = serverUrl.trim().replace(/\/$/, '');
    if (!url) { setError('Server URL is required'); return; }

    setError(null);
    setStep('probing');
    try {
      const info = await probeWithRetry(url);
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

  // ── Step 2a: Password login ───────────────────────────────────────────────
  async function handlePasswordLogin() {
    setError(null);
    setLoading(true);
    try {
      const token = await login(urlRef.current, password.trim());
      setPrefs({ serverUrl: urlRef.current });
      await saveToken(token);
      router.replace('/(files)/files');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  // ── Step 2b: OpenID login ─────────────────────────────────────────────────
  async function handleOpenIdLogin() {
    setError(null);
    setLoading(true);
    try {
      const serverUrl = urlRef.current;
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

      const parsed = Linking.parse(result.url);
      const token = parsed.queryParams?.token as string | undefined;
      if (!token) {
        setError('OpenID callback did not include a token');
        setLoading(false);
        return;
      }

      setPrefs({ serverUrl });
      await saveToken(token);
      router.replace('/(files)/files');
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

  // ── Render ────────────────────────────────────────────────────────────────
  if (!hasSeenOnboarding) return null;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        {/* Header */}
        <View style={styles.header}>
          <Image
            source={require('../../assets/splash-icon.png')}
            style={styles.logoImage}
          />
          <Text variant="displayLg" color={theme.colors.primary} style={styles.logoText}>
            {Constants.expoConfig?.name ?? 'Actual'}
          </Text>
          <Text variant="bodySm" color={theme.colors.textMuted}>
            Open-source personal finance
          </Text>
        </View>

        {/* Form */}
        <View style={styles.form}>
          {/* Server URL */}
          <Text variant="caption" color={theme.colors.textSecondary} style={styles.label}>
            SERVER URL
          </Text>
          <View style={styles.urlRow}>
            <View style={[styles.inputContainer, step !== 'idle' && step !== 'probing' && styles.inputLocked]}>
              <Ionicons name="server-outline" size={18} color={theme.colors.textMuted} />
              <TextInput
                style={[styles.input, { color: theme.colors.textPrimary }]}
                placeholder="https://budget.example.com"
                placeholderTextColor={theme.colors.textMuted}
                value={serverUrl}
                onChangeText={v => { setServerUrl(v); setStep('idle'); setError(null); }}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                returnKeyType="go"
                onSubmitEditing={step === 'idle' ? handleProbe : undefined}
                editable={step === 'idle' || step === 'probing'}
              />
            </View>
            {step !== 'idle' && step !== 'probing' && (
              <Pressable
                style={styles.changeBtn}
                onPress={handleChangeServer}
                hitSlop={8}
              >
                <Text variant="bodySm" color={theme.colors.primary} style={{ fontWeight: '600' }}>
                  Change
                </Text>
              </Pressable>
            )}
          </View>

          {/* Probing */}
          {step === 'probing' && (
            <View style={styles.probingRow}>
              <ActivityIndicator size="small" color={theme.colors.primary} />
              <Text variant="bodySm" color={theme.colors.textSecondary}>
                Connecting to server...
              </Text>
            </View>
          )}

          {/* Password form */}
          {step === 'password' && (
            <>
              <Text variant="caption" color={theme.colors.textSecondary} style={styles.label}>
                PASSWORD
              </Text>
              <View style={styles.inputContainer}>
                <Ionicons name="lock-closed-outline" size={18} color={theme.colors.textMuted} />
                <TextInput
                  style={[styles.input, { color: theme.colors.textPrimary }]}
                  placeholder="Server password"
                  placeholderTextColor={theme.colors.textMuted}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  autoCapitalize="none"
                  autoFocus
                  returnKeyType="go"
                  onSubmitEditing={handlePasswordLogin}
                />
              </View>
            </>
          )}

          {/* OpenID banner */}
          {step === 'openid' && (
            <Banner
              message="You'll be redirected to your identity provider to sign in securely."
              variant="info"
            />
          )}

          {/* Error */}
          {error && (
            <Banner
              message={error}
              variant="error"
              onDismiss={() => setError(null)}
            />
          )}

          {/* Action buttons */}
          {step === 'idle' && (
            <Button
              title="Continue"
              onPress={handleProbe}
              size="lg"
              style={styles.actionButton}
            />
          )}

          {step === 'password' && (
            <Button
              title="Sign In"
              onPress={handlePasswordLogin}
              size="lg"
              loading={loading}
              disabled={!password}
              style={styles.actionButton}
            />
          )}

          {step === 'openid' && (
            <Button
              title="Sign in with OpenID"
              onPress={handleOpenIdLogin}
              size="lg"
              loading={loading}
              style={styles.actionButton}
            />
          )}

          {/* DEV: Reset onboarding */}
          {__DEV__ && (
            <Pressable
              onPress={() => {
                usePrefsStore.getState().setPrefs({ hasSeenOnboarding: false });
                router.replace('/(public)/onboarding');
              }}
              style={{ marginTop: 32, alignSelf: 'center' }}
            >
              <Text variant="caption" color={theme.colors.textMuted}>
                [DEV] Replay onboarding
              </Text>
            </Pressable>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const createStyles = (theme: Theme) => ({
  flex: {
    flex: 1,
    backgroundColor: theme.colors.pageBackground,
  },
  container: {
    flexGrow: 1,
    paddingHorizontal: theme.spacing.xl,
    paddingTop: 100,
    paddingBottom: theme.spacing.xxxl,
  },

  // Header
  header: {
    alignItems: 'center' as const,
    marginBottom: theme.spacing.xxxl,
  },
  logoImage: {
    width: 100,
    height: 100,
    resizeMode: 'contain' as const,
    marginBottom: theme.spacing.sm,
  },
  logoText: {
    letterSpacing: -1,
    marginBottom: theme.spacing.xs,
  },

  // Form
  form: {
    gap: theme.spacing.sm,
  },
  label: {
    letterSpacing: 0.8,
    fontWeight: '600' as const,
    marginTop: theme.spacing.sm,
    marginLeft: theme.spacing.xs,
  },
  inputContainer: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: theme.colors.inputBackground,
    borderRadius: theme.borderRadius.full,
    borderWidth: theme.borderWidth.default,
    borderColor: theme.colors.inputBorder,
    paddingHorizontal: theme.spacing.lg,
    gap: theme.spacing.sm,
    minHeight: 50,
  },
  inputLocked: {
    opacity: 0.5,
  },
  input: {
    flex: 1,
    fontSize: 16,
    paddingVertical: theme.spacing.md,
  },

  urlRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing.sm,
  },
  changeBtn: {
    backgroundColor: theme.colors.buttonSecondaryBackground,
    borderRadius: theme.borderRadius.full,
    borderWidth: theme.borderWidth.default,
    borderColor: theme.colors.inputBorder,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    minHeight: 50,
    justifyContent: 'center' as const,
  },

  probingRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing.sm,
    marginTop: theme.spacing.sm,
    justifyContent: 'center' as const,
  },

  actionButton: {
    marginTop: theme.spacing.lg,
  },
});
