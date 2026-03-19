import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Switch,
  TextInput,
  View,
} from "react-native";

import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { EaseView } from "react-native-ease";
import { GoCardlessIcon } from "@/presentation/components/atoms/GoCardlessIcon";
import { useAccounts } from "@/presentation/hooks/useAccounts";
import { updateAccount } from "@/accounts";
import { useBankSyncStore } from "@/stores/bankSyncStore";
import { unlinkAccount } from "@/bank-sync";
import { Icon } from "@/presentation/components/atoms/Icon";
import { useTheme, useThemedStyles } from "@/presentation/providers/ThemeProvider";
import { Text } from "@/presentation/components/atoms/Text";
import { Button } from "@/presentation/components/atoms/Button";
import { Input } from "@/presentation/components/atoms/Input";
import { Divider } from "@/presentation/components/atoms/Divider";
import { ErrorBanner } from "@/presentation/components/molecules/ErrorBanner";
import { useErrorHandler } from "@/presentation/hooks/useErrorHandler";
import { useTranslation } from "react-i18next";
import type { Theme } from "@/theme";

export default function AccountSettingsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);
  const { t } = useTranslation("accounts");
  const { t: tc } = useTranslation("common");
  const { t: tb } = useTranslation("bankSync");
  const { accounts } = useAccounts();
  const {
    syncAccount,
    syncStatus,
    syncResults,
    providersChecked,
    goCardlessConfigured,
    simpleFinConfigured,
  } = useBankSyncStore();
  const account = accounts.find((a) => a.id === id);
  const isLinked = !!account?.accountSyncSource;
  const accountSyncStatus = syncStatus[id] ?? "idle";
  const accountSyncResult = syncResults[id];
  const [syncResultVisible, setSyncResultVisible] = useState(false);
  const [syncResultText, setSyncResultText] = useState("");

  useEffect(() => {
    useBankSyncStore.getState().checkProviders();
  }, []);

  // Show sync result briefly, then animate out
  useEffect(() => {
    if (accountSyncStatus === "success" && accountSyncResult) {
      const text =
        accountSyncResult.added + accountSyncResult.updated > 0
          ? tb("syncSuccess", {
              added: accountSyncResult.added,
              updated: accountSyncResult.updated,
            })
          : tb("syncSuccessNoChanges");
      setSyncResultText(text);
      setSyncResultVisible(true);
      const timer = setTimeout(() => setSyncResultVisible(false), 3500);
      return () => clearTimeout(timer);
    }
  }, [accountSyncStatus, accountSyncResult]);

  const [name, setName] = useState(account?.name ?? "");
  const [offbudget, setOffbudget] = useState(account?.offbudget ?? false);
  const [saving, setSaving] = useState(false);
  const { error, handleError, setValidationError, dismissError } = useErrorHandler();

  if (!account) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }

  const hasChanges = name.trim() !== account.name || offbudget !== account.offbudget;

  async function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) {
      setValidationError(t("settings.accountNameRequired"));
      return;
    }

    setSaving(true);
    await handleError(async () => {
      const changes: Record<string, unknown> = {};
      if (trimmed !== account!.name) changes.name = trimmed;
      if (offbudget !== account!.offbudget) changes.offbudget = offbudget;
      if (Object.keys(changes).length > 0) {
        await updateAccount(id, changes);
      }
      router.back();
    });
    setSaving(false);
  }

  function handleClose() {
    if (account!.closed) {
      Alert.alert(t("settings.reopenAccountTitle"), t("settings.reopenAccountMessage"), [
        { text: tc("cancel"), style: "cancel" },
        {
          text: t("settings.reopen"),
          onPress: async () => {
            setSaving(true);
            try {
              await updateAccount(id, { closed: false });
            } finally {
              setSaving(false);
            }
          },
        },
      ]);
    } else {
      router.push({ pathname: "/(auth)/account/close", params: { id } });
    }
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerLeft: () => (
            <Pressable
              onPress={() => router.back()}
              hitSlop={12}
              accessibilityLabel={tc("close")}
              accessibilityRole="button"
            >
              <Icon name="close" size={24} color={theme.colors.textSecondary} />
            </Pressable>
          ),
        }}
      />
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        {/* Account name */}
        <Text variant="bodySm" color={theme.colors.textSecondary} style={styles.label}>
          {t("settings.accountNameLabel")}
        </Text>
        <Input
          placeholder={t("settings.accountNamePlaceholder")}
          value={name}
          onChangeText={(text) => {
            setName(text);
            dismissError();
          }}
          returnKeyType="done"
        />

        {/* Off budget toggle */}
        <View style={styles.toggleRow}>
          <View style={styles.toggleText}>
            <Text variant="body" color={theme.colors.textPrimary}>
              {t("settings.offBudget")}
            </Text>
            <Text variant="captionSm" color={theme.colors.textMuted}>
              {t("settings.offBudgetDescription")}
            </Text>
          </View>
          <Switch
            value={offbudget}
            onValueChange={setOffbudget}
            trackColor={{
              false: theme.colors.inputBorder,
              true: theme.colors.primary,
            }}
            thumbColor={theme.colors.cardBackground}
            ios_backgroundColor={theme.colors.inputBorder}
            accessibilityLabel={t("settings.offBudget")}
          />
        </View>

        {/* Bank Sync */}
        <Divider style={styles.divider} />
        <Text variant="bodySm" color={theme.colors.textSecondary} style={styles.label}>
          {tb("title")}
        </Text>

        {isLinked ? (
          <>
            <View style={styles.syncRow}>
              <View style={styles.syncRowLeft}>
                {account.accountSyncSource === "goCardless" ? (
                  <GoCardlessIcon size={18} />
                ) : (
                  <Ionicons name="card-outline" size={16} color={theme.colors.primary} />
                )}
                <Text variant="body" color={theme.colors.textPrimary}>
                  {account.accountSyncSource === "goCardless" ? "GoCardless" : "SimpleFin"}
                </Text>
              </View>
              <Text variant="captionSm" color={theme.colors.textMuted}>
                {account.lastSync
                  ? new Date(account.lastSync).toLocaleDateString()
                  : tb("neverSynced")}
              </Text>
            </View>

            <EaseView
              animate={{
                opacity: syncResultVisible ? 1 : 0,
                translateY: syncResultVisible ? 0 : -4,
                scale: syncResultVisible ? 1 : 0.95,
              }}
              transition={{ type: "timing", duration: 250, easing: "easeOut" }}
              style={styles.syncResult}
              pointerEvents="none"
            >
              <Ionicons name="checkmark-circle" size={14} color={theme.colors.positive} />
              <Text variant="captionSm" color={theme.colors.positive}>
                {syncResultText || " "}
              </Text>
            </EaseView>

            <Button
              title={tb("syncNow")}
              onPress={() => syncAccount(id)}
              buttonStyle="bordered"
              icon="syncOutline"
              size="lg"
              loading={accountSyncStatus === "syncing"}
              disabled={saving || accountSyncStatus === "syncing"}
              style={styles.syncButton}
            />
          </>
        ) : (
          <Button
            title={tb("link")}
            onPress={() => {
              router.push({ pathname: "/(auth)/bank-sync", params: { localAccountId: id } });
            }}
            buttonStyle="bordered"
            icon="linkOutline"
            size="lg"
            disabled={saving || (providersChecked && !goCardlessConfigured && !simpleFinConfigured)}
          />
        )}

        {/* Error */}
        <ErrorBanner error={error} onDismiss={dismissError} />

        {/* Save button */}
        <Button
          title={tc("save")}
          onPress={handleSave}
          size="lg"
          loading={saving}
          disabled={!hasChanges || !name.trim()}
          style={styles.saveButton}
        />

        {/* Danger zone — bottom, isolated */}
        <View style={styles.dangerZone}>
          {isLinked && (
            <Button
              title={tb("unlinkAccount")}
              onPress={() => {
                Alert.alert(
                  tb("unlink.title"),
                  tb("unlink.message", { provider: account.accountSyncSource }),
                  [
                    { text: tc("cancel"), style: "cancel" },
                    {
                      text: tb("unlink.confirm"),
                      style: "destructive",
                      onPress: async () => {
                        await unlinkAccount(id);
                      },
                    },
                  ],
                );
              }}
              buttonStyle="borderless"
              icon="unlinkOutline"
              danger
              disabled={saving}
            />
          )}
          <Button
            title={account.closed ? t("contextMenu.reopenAccount") : t("contextMenu.closeAccount")}
            onPress={handleClose}
            buttonStyle="borderless"
            icon={account.closed ? "arrowUndoOutline" : "trashOutline"}
            danger={!account.closed}
            disabled={saving}
          />
        </View>
      </ScrollView>
    </>
  );
}

const createStyles = (theme: Theme) => ({
  flex: {
    flex: 1,
    backgroundColor: theme.colors.pageBackground,
  },
  center: {
    flex: 1,
    backgroundColor: theme.colors.pageBackground,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  container: {
    padding: theme.spacing.xl,
  },
  label: {
    marginTop: theme.spacing.lg,
    marginLeft: theme.spacing.xs,
    marginBottom: theme.spacing.xs,
  },
  toggleRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    backgroundColor: theme.colors.cardBackground,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    borderWidth: theme.borderWidth.default,
    borderColor: theme.colors.cardBorder,
    marginTop: theme.spacing.xl,
  },
  toggleText: {
    flex: 1,
    marginRight: theme.spacing.md,
  },
  divider: {
    marginTop: theme.spacing.xl,
    marginBottom: theme.spacing.sm,
  },
  syncRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    paddingHorizontal: theme.spacing.xs,
  },
  syncRowLeft: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: theme.spacing.xs,
  },
  syncResult: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: theme.spacing.xs,
    height: 20,
  },
  syncButton: {
    marginTop: theme.spacing.sm,
  },
  saveButton: {
    marginTop: theme.spacing.xxl,
  },
  dangerZone: {
    marginTop: theme.spacing.xxl * 2,
    gap: theme.spacing.xs,
  },
});
