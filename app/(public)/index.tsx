import { useCallback, useRef, useState } from "react";
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
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
import { Button, Card, Icon, Spinner, TextField, Input, Label, FieldError } from "@/ui";
import { ErrorBanner } from "@/presentation/components/molecules/ErrorBanner";
import { useErrorHandler } from "@/hooks/useErrorHandler";

WebBrowser.maybeCompleteAuthSession();

export default function LoginScreen() {
  const router = useRouter();
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

  const isLocked = step !== "idle" && step !== "probing";

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView
      className="flex-1 bg-background"
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerClassName="flex-grow px-6 pt-20 pb-12"
        keyboardShouldPersistTaps="handled"
      >
        <Animated.View style={contentAnimStyle}>
          {/* ─── Hero ─── */}
          <View className="items-center mb-12">
            <Image
              source={require("../../assets/splash-icon.png")}
              style={{ width: 100, height: 100, resizeMode: "contain" }}
            />
            <Text className="text-3xl font-bold text-accent mt-2">
              {Constants.expoConfig?.name ?? "Actual"}
            </Text>
            <Text className="text-sm text-muted mt-1">{t("tagline")}</Text>
          </View>

          {/* ─── Form Card ─── */}
          <Card className="p-5 gap-4">
            {/* Server URL */}
            <TextField isInvalid={step === "idle" && error?.category === "validation"}>
              <Label>{t("serverUrl")}</Label>
              <View className="flex-row items-center gap-2">
                <View className="flex-1">
                  <Input
                    testID="server-url-input"
                    placeholder={t("serverUrlPlaceholder")}
                    value={serverUrl}
                    onChangeText={(v: string) => {
                      setServerUrl(v);
                      setStep("idle");
                      dismissError();
                    }}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="url"
                    returnKeyType="go"
                    onSubmitEditing={step === "idle" ? handleProbe : undefined}
                    editable={!isLocked}
                    className="rounded-md"
                  />
                </View>
                {isLocked && (
                  <Pressable onPress={handleChangeServer} hitSlop={8}>
                    <Text className="text-accent text-sm font-semibold">{t("change")}</Text>
                  </Pressable>
                )}
              </View>
              {step === "idle" && error?.category === "validation" && (
                <FieldError>{error.message}</FieldError>
              )}
            </TextField>

            {/* Probing */}
            {step === "probing" && (
              <View className="flex-row items-center gap-2 py-2">
                <Spinner themeColor="accent" size="small" />
                <Text className="text-sm text-muted">{t("connecting")}</Text>
              </View>
            )}

            {/* Password */}
            {step === "password" && (
              <TextField isInvalid={error?.category === "validation"}>
                <Label>{t("password")}</Label>
                <Input
                  testID="password-input"
                  placeholder={t("passwordPlaceholder")}
                  value={password}
                  onChangeText={(v: string) => {
                    setPassword(v);
                    dismissError();
                  }}
                  secureTextEntry
                  autoCapitalize="none"
                  autoFocus
                  returnKeyType="go"
                  onSubmitEditing={handlePasswordLogin}
                  className="rounded-md"
                />
                {error?.category === "validation" && <FieldError>{error.message}</FieldError>}
              </TextField>
            )}

            {/* OpenID info */}
            {step === "openid" && (
              <View className="flex-row items-center gap-3 bg-accent/10 rounded-md p-3">
                <Icon name="Globe" size={20} themeColor="accent" />
                <Text className="text-sm text-foreground flex-1">{t("openIdRedirect")}</Text>
              </View>
            )}

            {/* Error banner (non-validation errors) */}
            {!(step === "password" && error?.category === "validation") && (
              <ErrorBanner error={error} onDismiss={dismissError} />
            )}

            {/* Action buttons */}
            {step === "idle" && (
              <Button variant="primary" size="lg" onPress={handleProbe}>
                {t("continue")}
              </Button>
            )}

            {step === "password" && (
              <Button
                variant="primary"
                size="lg"
                onPress={handlePasswordLogin}
                isDisabled={!password || loading}
              >
                {loading ? <Spinner themeColor="accent-foreground" size="small" /> : t("signIn")}
              </Button>
            )}

            {step === "openid" && (
              <Button variant="primary" size="lg" onPress={handleOpenIdLogin} isDisabled={loading}>
                {loading ? (
                  <Spinner themeColor="accent-foreground" size="small" />
                ) : (
                  t("signInWithOpenId")
                )}
              </Button>
            )}
          </Card>

          {/* ─── Secondary Actions ─── */}
          <Pressable
            onPress={() => {
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
            className="mt-8 self-center"
          >
            <Text className="text-sm text-muted">{t("useWithoutServer")}</Text>
          </Pressable>

          {/* DEV links */}
          {__DEV__ && (
            <Pressable
              onPress={() => usePrefsStore.getState().setPrefs({ hasSeenOnboarding: false })}
              className="mt-8 self-center"
            >
              <Text className="text-xs text-muted">{t("devReplayOnboarding")}</Text>
            </Pressable>
          )}
          {__DEV__ && (
            <Pressable
              onPress={() => router.push("/(public)/design-system")}
              className="mt-3 self-center"
            >
              <Text className="text-xs text-accent">Design System</Text>
            </Pressable>
          )}
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
