import { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { Input } from "@/presentation/components/atoms/Input";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import Constants from "expo-constants";
import { useTranslation } from "react-i18next";
import {
  getBootstrapInfo,
  login,
  initiateOpenIdLogin,
  type LoginMethod,
} from "@/services/authService";
import { getServerInfo } from "@/services/serverInfo";
import { usePrefsStore } from "@/stores/prefsStore";
import { useTheme, useThemedStyles } from "@/presentation/providers/ThemeProvider";
import { Text } from "@/presentation/components/atoms/Text";
import { Button } from "@/presentation/components/atoms/Button";
import { Banner } from "@/presentation/components/molecules/Banner";
import { ErrorBanner } from "@/presentation/components/molecules/ErrorBanner";
import { useErrorHandler } from "@/presentation/hooks/useErrorHandler";
import type { Theme } from "@/theme";

WebBrowser.maybeCompleteAuthSession();

export default function LoginScreen() {
  const router = useRouter();
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);
  const { setPrefs, saveToken } = usePrefsStore();
  const { t } = useTranslation("auth");
  const [serverUrl, setServerUrl] = useState("");
  const [password, setPassword] = useState("");
  const [step, setStep] = useState<"idle" | "probing" | LoginMethod>("idle");
  const [loading, setLoading] = useState(false);
  const { error, handleError, setValidationError, dismissError } = useErrorHandler();

  const urlRef = useRef("");
  const reducedMotion = useReducedMotion();
  const contentOpacity = useSharedValue(1);

  const contentAnimStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
  }));

  useFocusEffect(
    useCallback(() => {
      contentOpacity.value = withTiming(1, { duration: 200 });
    }, []),
  );

  // ── Step 1: Probe server ──────────────────────────────────────────────────
  async function probeWithRetry(url: string) {
    const retryDelays = [1500, 2500, 3000];
    let lastError: unknown;

    try {
      return await getBootstrapInfo(url);
    } catch (e) {
      lastError = e;
    }

    for (const delay of retryDelays) {
      await new Promise((r) => setTimeout(r, delay));
      try {
        return await getBootstrapInfo(url);
      } catch (e) {
        lastError = e;
      }
    }

    throw lastError;
  }

  async function handleProbe() {
    const url = serverUrl.trim().replace(/\/$/, "");
    if (!url) {
      setValidationError(t("serverUrlRequired"));
      return;
    }

    setStep("probing");
    const info = await handleError(() => probeWithRetry(url));
    if (!info) {
      setStep("idle");
      return;
    }

    urlRef.current = url;
    if (!info.bootstrapped) {
      setValidationError(t("serverNotSetUp"));
      setStep("idle");
      return;
    }

    setStep(info.loginMethod);
  }

  // ── Step 2a: Password login ───────────────────────────────────────────────
  async function handlePasswordLogin() {
    setLoading(true);
    await handleError(async () => {
      const token = await login(urlRef.current, password.trim());
      setPrefs({ serverUrl: urlRef.current });
      await saveToken(token);
      getServerInfo(urlRef.current).then((info) => {
        usePrefsStore.getState().setServerVersion(info.version);
      });
      router.replace("/(files)/files");
    });
    setLoading(false);
  }

  // ── Step 2b: OpenID login ─────────────────────────────────────────────────
  async function handleOpenIdLogin() {
    setLoading(true);
    await handleError(async () => {
      const serverUrl = urlRef.current;
      const appScheme = "actualbudget";
      const serverHostname = new URL(serverUrl).hostname;
      const returnUrl = `${appScheme}://${serverHostname}`;
      const callbackUrl = `${returnUrl}/openid-cb`;

      const authUrl = await initiateOpenIdLogin(serverUrl, returnUrl);
      const result = await WebBrowser.openAuthSessionAsync(authUrl, callbackUrl);

      if (result.type !== "success") {
        setLoading(false);
        return;
      }

      const parsed = Linking.parse(result.url);
      const token = parsed.queryParams?.token as string | undefined;
      if (!token) {
        setValidationError(t("openIdNoToken"));
        setLoading(false);
        return;
      }

      setPrefs({ serverUrl });
      await saveToken(token);
      getServerInfo(serverUrl).then((info) => {
        usePrefsStore.getState().setServerVersion(info.version);
      });
      router.replace("/(files)/files");
    });
    setLoading(false);
  }

  function handleChangeServer() {
    setStep("idle");
    setPassword("");
    dismissError();
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Animated.View style={contentAnimStyle}>
          {/* Header */}
          <View style={styles.header}>
            <Image source={require("../../assets/splash-icon.png")} style={styles.logoImage} />
            <Text variant="displayLg" color={theme.colors.primary} style={styles.logoText}>
              {Constants.expoConfig?.name ?? "Actual"}
            </Text>
            <Text variant="bodySm" color={theme.colors.textMuted}>
              {t("tagline")}
            </Text>
          </View>

          {/* Form */}
          <View style={styles.form}>
            {/* Server URL */}
            <Text variant="caption" color={theme.colors.textSecondary} style={styles.label}>
              {t("serverUrl")}
            </Text>
            <View style={styles.urlRow}>
              <Input
                testID="server-url-input"
                icon="serverOutline"
                placeholder={t("serverUrlPlaceholder")}
                value={serverUrl}
                onChangeText={(v) => {
                  setServerUrl(v);
                  setStep("idle");
                  dismissError();
                }}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                returnKeyType="go"
                onSubmitEditing={step === "idle" ? handleProbe : undefined}
                editable={step === "idle" || step === "probing"}
                containerStyle={[
                  styles.inputContainer,
                  step !== "idle" && step !== "probing" && styles.inputLocked,
                ]}
              />
              {step !== "idle" && step !== "probing" && (
                <Pressable style={styles.changeBtn} onPress={handleChangeServer} hitSlop={8}>
                  <Text variant="bodySm" color={theme.colors.primary} style={{ fontWeight: "600" }}>
                    {t("change")}
                  </Text>
                </Pressable>
              )}
            </View>

            {/* Probing */}
            {step === "probing" && (
              <View style={styles.probingRow}>
                <ActivityIndicator size="small" color={theme.colors.primary} />
                <Text variant="bodySm" color={theme.colors.textSecondary}>
                  {t("connecting")}
                </Text>
              </View>
            )}

            {/* Password form */}
            {step === "password" && (
              <>
                <Text variant="caption" color={theme.colors.textSecondary} style={styles.label}>
                  {t("password")}
                </Text>
                <Input
                  testID="password-input"
                  icon="lockClosedOutline"
                  placeholder={t("passwordPlaceholder")}
                  value={password}
                  onChangeText={(v) => {
                    setPassword(v);
                    dismissError();
                  }}
                  secureTextEntry
                  autoCapitalize="none"
                  autoFocus
                  returnKeyType="go"
                  onSubmitEditing={handlePasswordLogin}
                  error={error?.category === "validation"}
                  containerStyle={styles.inputContainer}
                />
                {error?.category === "validation" && (
                  <Text variant="captionSm" color={theme.colors.errorText}>
                    {error.message}
                  </Text>
                )}
              </>
            )}

            {/* OpenID banner */}
            {step === "openid" && <Banner message={t("openIdRedirect")} variant="info" />}

            {/* Error — password validation is inline; other errors show as Banner */}
            {!(step === "password" && error?.category === "validation") && (
              <ErrorBanner error={error} onDismiss={dismissError} />
            )}

            {/* Action buttons */}
            {step === "idle" && (
              <Button
                title={t("continue")}
                onPress={handleProbe}
                size="lg"
                style={styles.actionButton}
              />
            )}

            {step === "password" && (
              <Button
                title={t("signIn")}
                onPress={handlePasswordLogin}
                size="lg"
                loading={loading}
                disabled={!password}
                style={styles.actionButton}
              />
            )}

            {step === "openid" && (
              <Button
                title={t("signInWithOpenId")}
                onPress={handleOpenIdLogin}
                size="lg"
                loading={loading}
                style={styles.actionButton}
              />
            )}

            {/* Local mode */}
            <Pressable
              onPress={() => {
                // Clear any stale budget state so the user doesn't auto-open an old budget
                usePrefsStore.getState().setPrefs({
                  activeBudgetId: "",
                  fileId: "",
                  groupId: "",
                  encryptKeyId: undefined,
                  lastSyncedTimestamp: undefined,
                  budgetName: undefined,
                });
                if (!reducedMotion) {
                  contentOpacity.value = withTiming(0, { duration: 200 });
                  setTimeout(() => router.push("/(public)/local-setup"), 180);
                } else {
                  router.push("/(public)/local-setup");
                }
              }}
              style={{ marginTop: 32, alignSelf: "center" }}
            >
              <Text variant="bodySm" color={theme.colors.textSecondary}>
                {t("useWithoutServer")}
              </Text>
            </Pressable>

            {/* DEV: Reset onboarding */}
            {__DEV__ && (
              <Pressable
                onPress={() => {
                  usePrefsStore.getState().setPrefs({ hasSeenOnboarding: false });
                }}
                style={{ marginTop: 32, alignSelf: "center" }}
              >
                <Text variant="caption" color={theme.colors.textMuted}>
                  {t("devReplayOnboarding")}
                </Text>
              </Pressable>
            )}
            {__DEV__ && (
              <Pressable
                onPress={() => router.push("/(public)/design-system")}
                style={{ marginTop: 12, alignSelf: "center" }}
              >
                <Text variant="caption" color={theme.colors.primary}>
                  Design System
                </Text>
              </Pressable>
            )}
          </View>
        </Animated.View>
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
    alignItems: "center" as const,
    marginBottom: theme.spacing.xxxl,
  },
  logoImage: {
    width: 100,
    height: 100,
    resizeMode: "contain" as const,
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
    fontWeight: "600" as const,
    marginTop: theme.spacing.sm,
    marginLeft: theme.spacing.xs,
  },
  inputContainer: {
    flex: 1,
    flexDirection: "row" as const,
    alignItems: "center" as const,
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

  urlRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
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
    justifyContent: "center" as const,
  },

  probingRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: theme.spacing.sm,
    marginTop: theme.spacing.sm,
    justifyContent: "center" as const,
  },

  actionButton: {
    marginTop: theme.spacing.lg,
  },
});
