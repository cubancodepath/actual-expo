import { useEffect, useState } from "react";
import { View } from "react-native";
import { create } from "zustand";
import { useTranslation } from "react-i18next";
import {
  Button,
  Dialog,
  FieldError,
  Input,
  Spinner,
  TextField,
  useThemeColor,
} from "heroui-native";
import * as encryptionService from "@/services/encryptionService";
import { useSessionStore } from "@/stores/sessionStore";
import { useBudgetContextStore } from "@/stores/budgetContextStore";

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
  const { fileId } = useBudgetContextStore.getState();
  return usePromptStore.getState()._show("enable", fileId);
}

/**
 * heroui Dialog for the encryption password flows (unlock / enable).
 * Mounted ONCE in app/_layout.tsx; opened imperatively via
 * promptForPassword / promptToEnableEncryption.
 */
export function EncryptionPasswordPrompt() {
  const { t } = useTranslation("common");
  const accentForeground = useThemeColor("accent-foreground");

  const { visible, mode, cloudFileId, _resolve, _hide } = usePromptStore();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (visible) {
      setPassword("");
      setConfirmPassword("");
      setError("");
      setLoading(false);
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

    const { serverUrl, token } = useSessionStore.getState();
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

    const { serverUrl, token } = useSessionStore.getState();
    const { activeBudgetId } = useBudgetContextStore.getState();
    const result = await encryptionService.enableEncryption({
      serverUrl,
      token,
      cloudFileId,
      budgetId: activeBudgetId,
      password: password.trim(),
    });

    if ("success" in result) {
      useBudgetContextStore.getState().setBudgetContext({
        encryptKeyId: undefined,
        groupId: result.groupId,
      });
      const { readMetadata } = await import("@/services/budgetMetadata");
      const meta = await readMetadata(activeBudgetId);
      if (meta?.encryptKeyId) {
        useBudgetContextStore.getState().setBudgetContext({ encryptKeyId: meta.encryptKeyId });
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

  const isEnable = mode === "enable";
  const handleSubmit = isEnable ? handleEnable : handleUnlock;
  const canSubmit = isEnable
    ? password.trim().length > 0 && confirmPassword.length > 0
    : password.trim().length > 0;

  return (
    <Dialog isOpen={visible} onOpenChange={(open) => !open && handleCancel()}>
      <Dialog.Portal>
        <Dialog.Overlay />
        <Dialog.Content>
          <View className="mb-5 gap-1.5">
            <Dialog.Title>
              {isEnable ? t("encryption.enableTitle") : t("encryption.enterPasswordTitle")}
            </Dialog.Title>
            <Dialog.Description>
              {isEnable
                ? t("encryption.enableDescription")
                : t("encryption.enterPasswordDescription")}
            </Dialog.Description>
          </View>

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
            <TextField isInvalid={!!error} isDisabled={loading} className="mt-3">
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

          <View className="mt-5 flex-row gap-3">
            <Button variant="ghost" className="flex-1" onPress={handleCancel} isDisabled={loading}>
              <Button.Label>{t("cancel")}</Button.Label>
            </Button>
            <Button
              variant="primary"
              className="flex-1"
              onPress={handleSubmit}
              isDisabled={!canSubmit || loading}
            >
              {loading && <Spinner size="sm" color={accentForeground} />}
              <Button.Label>
                {isEnable ? t("encryption.enable") : t("encryption.unlock")}
              </Button.Label>
            </Button>
          </View>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog>
  );
}
