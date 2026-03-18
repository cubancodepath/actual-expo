import { useState, useEffect, useRef } from "react";
import { Modal, View, TextInput, KeyboardAvoidingView, Platform, Pressable } from "react-native";
import { Input } from "../atoms/Input";
import { create } from "zustand";
import { useTranslation } from "react-i18next";
import { useTheme, useThemedStyles } from "../../providers/ThemeProvider";
import { Text } from "../atoms/Text";
import { Button } from "../atoms/Button";
import * as encryptionService from "../../../services/encryptionService";
import { usePrefsStore } from "../../../stores/prefsStore";
import type { Theme } from "../../../theme";

type PromptMode = "unlock" | "enable";

type PromptState = {
  visible: boolean;
  mode: PromptMode;
  cloudFileId: string;
  _resolve: ((result: "success" | "cancelled") => void) | null;
  _show: (mode: PromptMode, cloudFileId: string) => Promise<"success" | "cancelled">;
  _hide: () => void;
};

const usePromptStore = create<PromptState>((set, get) => ({
  visible: false,
  mode: "unlock",
  cloudFileId: "",
  _resolve: null,

  _show(mode: PromptMode, cloudFileId: string) {
    const prev = get()._resolve;
    if (prev) prev("cancelled");

    return new Promise<"success" | "cancelled">((resolve) => {
      set({ visible: true, mode, cloudFileId, _resolve: resolve });
    });
  },

  _hide() {
    set({ visible: false, cloudFileId: "", _resolve: null });
  },
}));

/**
 * Prompt for password to unlock an encrypted budget.
 */
export function promptForPassword(cloudFileId: string): Promise<"success" | "cancelled"> {
  return usePromptStore.getState()._show("unlock", cloudFileId);
}

/**
 * Prompt to set a new encryption password for the current budget.
 */
export function promptToEnableEncryption(): Promise<"success" | "cancelled"> {
  const { fileId } = usePrefsStore.getState();
  return usePromptStore.getState()._show("enable", fileId);
}

export function EncryptionPasswordPrompt() {
  const { t } = useTranslation("common");
  const { colors, shadows } = useTheme();
  const styles = useThemedStyles(createStyles);

  const { visible, mode, cloudFileId, _resolve, _hide } = usePromptStore();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (visible) {
      setPassword("");
      setConfirmPassword("");
      setError("");
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [visible]);

  function handleCancel() {
    _resolve?.("cancelled");
    _hide();
  }

  async function handleUnlock() {
    if (!password.trim() || loading) return;

    setError("");
    setLoading(true);

    const { serverUrl, token } = usePrefsStore.getState();
    const result = await encryptionService.testKey({
      serverUrl,
      token,
      cloudFileId,
      password: password.trim(),
    });

    setLoading(false);

    if ("success" in result) {
      _resolve?.("success");
      _hide();
    } else if (result.error === "decrypt-failure") {
      setError(t("encryption.wrongPassword"));
    } else if (result.error === "network") {
      setError(t("encryption.networkError"));
    } else {
      setError(t("encryption.unsupportedKeyFormat"));
    }
  }

  async function handleEnable() {
    if (!password.trim() || loading) return;

    if (password !== confirmPassword) {
      setError(t("encryption.passwordsMismatch"));
      return;
    }

    setError("");
    setLoading(true);

    // Yield to let React render the loading state before heavy crypto work
    await new Promise((resolve) => setTimeout(resolve, 50));

    const { serverUrl, token, activeBudgetId } = usePrefsStore.getState();
    const result = await encryptionService.enableEncryption({
      serverUrl,
      token,
      cloudFileId,
      budgetId: activeBudgetId,
      password: password.trim(),
    });

    if ("success" in result) {
      usePrefsStore.getState().setPrefs({
        encryptKeyId: undefined,
        groupId: result.groupId,
      });
      const { readMetadata } = await import("../../../services/budgetMetadata");
      const meta = await readMetadata(activeBudgetId);
      if (meta?.encryptKeyId) {
        usePrefsStore.getState().setPrefs({ encryptKeyId: meta.encryptKeyId });
      }
      _resolve?.("success");
      _hide();
    } else {
      setLoading(false);
      setError(
        result.error === "network" ? t("encryption.networkError") : t("encryption.enableFailed"),
      );
    }
  }

  const handleSubmit = mode === "unlock" ? handleUnlock : handleEnable;
  const isEnable = mode === "enable";

  const title = isEnable ? t("encryption.enableTitle") : t("encryption.enterPasswordTitle");
  const description = isEnable
    ? t("encryption.enableDescription")
    : t("encryption.enterPasswordDescription");
  const submitLabel = isEnable ? t("encryption.enable") : t("encryption.unlock");
  const canSubmit = isEnable
    ? password.trim().length > 0 && confirmPassword.length > 0
    : password.trim().length > 0;

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={handleCancel}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.overlay}
      >
        <Pressable style={styles.backdrop} onPress={handleCancel} />
        <View style={[styles.card, shadows.modal]}>
          <Text variant="headingLg" style={styles.title}>
            {title}
          </Text>
          <Text variant="body" color={colors.textMuted} style={styles.description}>
            {description}
          </Text>

          <Input
            ref={inputRef}
            icon="lockClosedOutline"
            secureTextEntry
            placeholder={t("encryption.passwordPlaceholder")}
            value={password}
            onChangeText={setPassword}
            onSubmitEditing={isEnable ? undefined : handleSubmit}
            returnKeyType={isEnable ? "next" : "done"}
            editable={!loading}
            autoCapitalize="none"
            autoCorrect={false}
            error={!!error}
          />

          {isEnable && (
            <Input
              icon="lockClosedOutline"
              secureTextEntry
              placeholder={t("encryption.confirmPasswordPlaceholder")}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              onSubmitEditing={handleSubmit}
              returnKeyType="done"
              editable={!loading}
              autoCapitalize="none"
              autoCorrect={false}
              error={!!error}
              containerStyle={{ marginTop: 12 }}
            />
          )}

          {error ? (
            <Text variant="bodySm" color={colors.errorText} style={styles.error}>
              {error}
            </Text>
          ) : null}

          <View style={styles.buttons}>
            <Button
              title={t("cancel")}
              buttonStyle="borderless"
              onPress={handleCancel}
              disabled={loading}
              style={{ flex: 1 }}
            />
            <Button
              title={submitLabel}
              onPress={handleSubmit}
              loading={loading}
              disabled={!canSubmit || loading}
              style={{ flex: 1 }}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const createStyles = (theme: Theme) => ({
  overlay: {
    flex: 1,
    justifyContent: "center" as const,
    alignItems: "center" as const,
    padding: theme.spacing.xl,
  },
  backdrop: {
    ...({
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: "rgba(0,0,0,0.5)",
    } as const),
  },
  card: {
    width: "100%" as const,
    maxWidth: 400,
    backgroundColor: theme.colors.cardBackground,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.xl,
  },
  title: {
    marginBottom: theme.spacing.xs,
  },
  description: {
    marginBottom: theme.spacing.lg,
  },
  error: {
    marginTop: theme.spacing.sm,
  },
  buttons: {
    flexDirection: "row" as const,
    gap: theme.spacing.md,
    marginTop: theme.spacing.lg,
  },
});
