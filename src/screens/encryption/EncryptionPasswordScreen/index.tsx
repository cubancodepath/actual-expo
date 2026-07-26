import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { useNavigation, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Button, FieldError, Input, TextField, Typography, useThemeColor } from "heroui-native";
import { X } from "lucide-react-native";
import { keyMake, keyTest } from "@/core/server/encryption/app";
import { useSessionStore } from "@/stores/sessionStore";
import { useBudgetContextStore } from "@/stores/budgetContextStore";
import { ScreenHeader } from "@/ui/ScreenHeader";
import { busy } from "@/ui/feedback/busy";
import {
  settleEncryptionPrompt,
  useEncryptionPromptStore,
} from "@/ui/feedback/EncryptionPasswordPrompt";

/**
 * Password sheet for the encryption flows (unlock / enable) — a route form-sheet
 * shaped like Hold/Reconcile (our header: X to cancel, ✓ to confirm). Opened by
 * `promptForPassword` / `promptToEnableEncryption`, which bridge navigation to a
 * promise; this screen settles it on submit/cancel/dismiss.
 */
export function EncryptionPasswordScreen() {
  const { t } = useTranslation("common");
  const router = useRouter();
  const navigation = useNavigation();
  const foreground = useThemeColor("foreground");

  const mode = useEncryptionPromptStore((s) => s.mode);
  const cloudFileId = useEncryptionPromptStore((s) => s.cloudFileId);
  const hasExistingKey = useEncryptionPromptStore((s) => s.hasExistingKey);
  const isEnable = mode === "enable";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const settled = useRef(false);

  // Settle as cancelled if the sheet is dismissed without a successful submit
  // (swipe-down, hardware back, or the X button). Idempotent after a success.
  useEffect(
    () => () => {
      if (!settled.current) settleEncryptionPrompt("cancelled");
    },
    [],
  );

  // Block the sheet's swipe-to-dismiss while the (blocking) operation runs — the
  // overlay stops JS touches but not the native sheet gesture.
  useEffect(() => {
    navigation.setOptions({ gestureEnabled: !loading });
  }, [navigation, loading]);

  function finish() {
    settled.current = true;
    settleEncryptionPrompt("success");
    router.back();
  }

  async function handleUnlock() {
    if (!password.trim() || loading) return;
    setError("");
    setLoading(true);

    // Blocks behind the root overlay (which reaches over this form sheet).
    const result = await busy.run(() => {
      const { serverUrl, token } = useSessionStore.getState();
      return keyTest({
        serverUrl,
        token,
        cloudFileId,
        password: password.trim(),
      });
    });

    if (!("error" in result)) {
      finish();
      return;
    }

    setLoading(false);
    if (result.error.reason === "decrypt-failure") setError(t("encryption.wrongPassword"));
    else if (result.error.reason === "network") setError(t("encryption.networkError"));
    else setError(t("encryption.unsupportedKeyFormat"));
  }

  async function handleEnable() {
    if (!password.trim() || loading) return;
    if (password !== confirmPassword) {
      setError(t("encryption.passwordsMismatch"));
      return;
    }
    setError("");
    setLoading(true);

    const { activeBudgetId } = useBudgetContextStore.getState();
    // Blocks behind the root overlay (which reaches over this form sheet).
    const result = await busy.run(async () => {
      // Yield so the overlay paints before the heavy crypto work.
      await new Promise((resolve) => setTimeout(resolve, 50));
      const { serverUrl, token } = useSessionStore.getState();
      return keyMake({
        serverUrl,
        token,
        cloudFileId,
        budgetId: activeBudgetId,
        password: password.trim(),
      });
    });

    if (!("error" in result)) {
      useBudgetContextStore.getState().setBudgetContext({
        encryptKeyId: undefined,
        groupId: result.groupId,
      });
      const { readMetadata } = await import("@/core/server/prefs");
      const meta = await readMetadata(activeBudgetId);
      if (meta?.encryptKeyId) {
        useBudgetContextStore.getState().setBudgetContext({ encryptKeyId: meta.encryptKeyId });
      }
      finish();
      return;
    }

    setLoading(false);
    setError(
      result.error.reason === "network"
        ? t("encryption.networkError")
        : t("encryption.enableFailed"),
    );
  }

  const handleSubmit = isEnable ? handleEnable : handleUnlock;
  const canSubmit = isEnable
    ? password.trim().length > 0 && confirmPassword.length > 0
    : password.trim().length > 0;

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader>
        <ScreenHeader.Back>
          <Button
            variant="secondary"
            isIconOnly
            className="rounded-full"
            onPress={() => router.back()}
          >
            <X size={24} color={foreground} />
          </Button>
        </ScreenHeader.Back>
        <ScreenHeader.Title>
          {isEnable
            ? t("encryption.enableTitle")
            : hasExistingKey
              ? t("encryption.decryptFailedTitle")
              : t("encryption.enterPasswordTitle")}
        </ScreenHeader.Title>
      </ScreenHeader>

      <View className="gap-3 px-4 pt-2">
        <Typography className="text-sm text-muted">
          {isEnable
            ? t("encryption.enableDescription")
            : hasExistingKey
              ? t("encryption.decryptFailedDescription")
              : t("encryption.enterPasswordDescription")}
        </Typography>

        <TextField isInvalid={!!error} isDisabled={loading}>
          <Input
            secureTextEntry
            autoFocus
            placeholder={t("encryption.passwordPlaceholder")}
            value={password}
            onChangeText={(text) => {
              setPassword(text);
              setError("");
            }}
            onSubmitEditing={isEnable ? undefined : handleSubmit}
            returnKeyType={isEnable ? "next" : "done"}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {!isEnable && !!error && <FieldError>{error}</FieldError>}
        </TextField>

        {isEnable && (
          <TextField isInvalid={!!error} isDisabled={loading}>
            <Input
              secureTextEntry
              placeholder={t("encryption.confirmPasswordPlaceholder")}
              value={confirmPassword}
              onChangeText={(text) => {
                setConfirmPassword(text);
                setError("");
              }}
              onSubmitEditing={handleSubmit}
              returnKeyType="done"
              autoCapitalize="none"
              autoCorrect={false}
            />
            {!!error && <FieldError>{error}</FieldError>}
          </TextField>
        )}

        <Button
          variant="primary"
          className="mt-4"
          isDisabled={!canSubmit || loading}
          onPress={handleSubmit}
        >
          <Button.Label>{isEnable ? t("encryption.enable") : t("encryption.unlock")}</Button.Label>
        </Button>
      </View>
    </View>
  );
}
