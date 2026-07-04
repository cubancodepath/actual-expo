import { useCallback } from "react";
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { withUniwind } from "uniwind";
import * as WebBrowser from "expo-web-browser";
import Constants from "expo-constants";
import { useTranslation } from "react-i18next";
import {
  Alert,
  Button,
  CloseButton,
  FieldError,
  Input,
  Spinner,
  TextField,
  Typography,
  useThemeColor,
} from "heroui-native";
import { usePrefsStore } from "@/stores/prefsStore";
import { useLoginFlow } from "@/features/auth/hooks/useLoginFlow";

WebBrowser.maybeCompleteAuthSession();

const StyledIonicons = withUniwind(Ionicons);

export function LoginScreen() {
  const router = useRouter();
  const { t } = useTranslation("auth");
  const {
    serverUrl,
    password,
    step,
    loading,
    error,
    isServerLocked,
    setServerUrl,
    setPassword,
    handleProbe,
    handlePasswordLogin,
    handleOpenIdLogin,
    handleChangeServer,
    dismissError,
  } = useLoginFlow();

  const accentForeground = useThemeColor("accent-foreground");
  const accent = useThemeColor("accent");

  const reducedMotion = useReducedMotion();
  const contentOpacity = useSharedValue(1);

  const contentAnimStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
  }));

  useFocusEffect(
    useCallback(() => {
      contentOpacity.value = withTiming(1, { duration: 200 });
    }, [contentOpacity]),
  );

  function handleUseWithoutServer() {
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
  }

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-background"
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerClassName="flex-grow px-6 pt-24 pb-16"
        keyboardShouldPersistTaps="handled"
      >
        <Animated.View style={contentAnimStyle}>
          {/* Header */}
          <View className="items-center mb-16">
            <Image
              source={require("../../../../assets/splash-icon.png")}
              resizeMode="contain"
              style={{ width: 100, height: 100 }}
              className="mb-2"
            />
            <Typography.Heading type="h1" className="tracking-tighter mb-1">
              {Constants.expoConfig?.name ?? "Actual"}
            </Typography.Heading>
            <Typography type="body-sm" color="muted">
              {t("tagline")}
            </Typography>
          </View>

          {/* Form */}
          <View className="gap-2">
            {/* Server URL */}
            <Typography
              type="body-xs"
              weight="semibold"
              color="muted"
              className="uppercase tracking-wide mt-2 ml-1"
            >
              {t("serverUrl")}
            </Typography>
            <View className="flex-row items-center gap-2">
              <View
                className={`flex-1 flex-row items-center ${isServerLocked ? "opacity-50" : ""}`}
              >
                <Input
                  testID="server-url-input"
                  placeholder={t("serverUrlPlaceholder")}
                  value={serverUrl}
                  onChangeText={setServerUrl}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  returnKeyType="go"
                  onSubmitEditing={step === "idle" ? handleProbe : undefined}
                  editable={step === "idle" || step === "probing"}
                  className="flex-1 pl-10"
                />
                <StyledIonicons
                  name="server-outline"
                  size={16}
                  className="absolute left-3.5 text-muted"
                  pointerEvents="none"
                />
              </View>
              {isServerLocked && (
                <Pressable
                  className="bg-surface-secondary rounded-full border border-border px-4 py-3 min-h-[50px] justify-center"
                  onPress={handleChangeServer}
                  hitSlop={8}
                >
                  <Typography type="body-sm" weight="semibold" className="text-accent">
                    {t("change")}
                  </Typography>
                </Pressable>
              )}
            </View>

            {/* Probing */}
            {step === "probing" && (
              <View className="flex-row items-center gap-2 mt-2 justify-center">
                <Spinner size="sm" color={accent} />
                <Typography type="body-sm" color="muted">
                  {t("connecting")}
                </Typography>
              </View>
            )}

            {/* Password form */}
            {step === "password" && (
              <TextField isInvalid={error?.category === "validation"}>
                <Typography
                  type="body-xs"
                  weight="semibold"
                  color="muted"
                  className="uppercase tracking-wide mt-2 ml-1"
                >
                  {t("password")}
                </Typography>
                <View className="flex-row items-center">
                  <Input
                    testID="password-input"
                    placeholder={t("passwordPlaceholder")}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                    autoCapitalize="none"
                    autoFocus
                    returnKeyType="go"
                    onSubmitEditing={handlePasswordLogin}
                    className="flex-1 pl-10"
                  />
                  <StyledIonicons
                    name="lock-closed-outline"
                    size={16}
                    className="absolute left-3.5 text-muted"
                    pointerEvents="none"
                  />
                </View>
                {error?.category === "validation" && <FieldError>{error.message}</FieldError>}
              </TextField>
            )}

            {/* OpenID banner */}
            {step === "openid" && (
              <Alert status="accent">
                <Alert.Indicator />
                <Alert.Content>
                  <Alert.Description>{t("openIdRedirect")}</Alert.Description>
                </Alert.Content>
              </Alert>
            )}

            {/* Error — password validation is inline; other errors show as Alert */}
            {!(step === "password" && error?.category === "validation") && error && (
              <Alert status="danger">
                <Alert.Indicator />
                <Alert.Content>
                  <Alert.Description>{error.message}</Alert.Description>
                </Alert.Content>
                <CloseButton onPress={dismissError} />
              </Alert>
            )}

            {/* Action buttons */}
            {step === "idle" && (
              <Button variant="primary" size="lg" onPress={handleProbe} className="mt-4">
                <Button.Label>{t("continue")}</Button.Label>
              </Button>
            )}

            {step === "password" && (
              <Button
                variant="primary"
                size="lg"
                onPress={handlePasswordLogin}
                isDisabled={!password}
                isIconOnly={loading}
                className="mt-4"
              >
                {loading ? (
                  <Spinner color={accentForeground} />
                ) : (
                  <Button.Label>{t("signIn")}</Button.Label>
                )}
              </Button>
            )}

            {step === "openid" && (
              <Button
                variant="primary"
                size="lg"
                onPress={handleOpenIdLogin}
                isIconOnly={loading}
                className="mt-4"
              >
                {loading ? (
                  <Spinner color={accentForeground} />
                ) : (
                  <Button.Label>{t("signInWithOpenId")}</Button.Label>
                )}
              </Button>
            )}

            {/* Local mode */}
            <Pressable onPress={handleUseWithoutServer} className="mt-8 self-center">
              <Typography type="body-sm" color="muted">
                {t("useWithoutServer")}
              </Typography>
            </Pressable>

            {/* DEV: Reset onboarding */}
            {__DEV__ && (
              <Pressable
                onPress={() => {
                  usePrefsStore.getState().setPrefs({ hasSeenOnboarding: false });
                }}
                className="mt-8 self-center"
              >
                <Typography type="body-xs" color="muted">
                  {t("devReplayOnboarding")}
                </Typography>
              </Pressable>
            )}
          </View>
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
