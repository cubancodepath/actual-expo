import { useState } from "react";
import { Platform, ScrollView, Switch, View } from "react-native";
import { Input } from "@/presentation/components/atoms/Input";
import { Stack, useRouter } from "expo-router";
import { createAccount } from "@core/accounts";
import { useTheme, useThemedStyles } from "@/presentation/providers/ThemeProvider";
import { Text } from "@/presentation/components/atoms/Text";
import { Button } from "@/presentation/components/atoms/Button";
import { ErrorBanner } from "@/presentation/components/molecules/ErrorBanner";
import { useErrorHandler } from "@/presentation/hooks/useErrorHandler";
import { useTranslation } from "react-i18next";
import type { Theme } from "@/theme";

/** Parse a user-typed balance string like "1,234.56" or "-50" into cents */
function parseToCents(raw: string): number {
  const cleaned = raw.replace(/[^0-9.-]/g, "");
  const num = parseFloat(cleaned);
  if (isNaN(num)) return 0;
  return Math.round(num * 100);
}

export default function NewAccountScreen() {
  const router = useRouter();
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);

  const { t } = useTranslation("accounts");
  const [name, setName] = useState("");
  const [balanceStr, setBalanceStr] = useState("");
  const [offbudget, setOffbudget] = useState(false);
  const [loading, setLoading] = useState(false);
  const { error, handleError, setValidationError, dismissError } = useErrorHandler();

  async function handleCreate() {
    const trimmed = name.trim();
    if (!trimmed) {
      setValidationError(t("newAccount.accountNameRequired"));
      return;
    }

    setLoading(true);
    await handleError(async () => {
      const startingBalance = parseToCents(balanceStr);
      await createAccount({ name: trimmed, offbudget, closed: false }, startingBalance);
      router.back();
    });
    setLoading(false);
  }

  return (
    <>
      <Stack.Screen options={{}} />
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        {/* Account name */}
        <Text variant="caption" color={theme.colors.textSecondary} style={styles.label}>
          {t("newAccount.accountNameLabel")}
        </Text>
        <Input
          placeholder={t("newAccount.accountNamePlaceholder")}
          value={name}
          onChangeText={(text) => {
            setName(text);
            dismissError();
          }}
          autoFocus
          returnKeyType="next"
        />

        {/* Starting balance */}
        <Text variant="caption" color={theme.colors.textSecondary} style={styles.label}>
          {t("newAccount.startingBalanceLabel")}
        </Text>
        <Input
          icon="cashOutline"
          placeholder="0.00"
          value={balanceStr}
          onChangeText={setBalanceStr}
          keyboardType={Platform.OS === "ios" ? "numbers-and-punctuation" : "numeric"}
          returnKeyType="done"
          onSubmitEditing={handleCreate}
        />
        <Text variant="captionSm" color={theme.colors.textMuted} style={styles.hint}>
          {t("newAccount.startingBalanceHint")}
        </Text>

        {/* Off budget toggle */}
        <View style={styles.toggleRow}>
          <View style={styles.toggleText}>
            <Text variant="body" color={theme.colors.textPrimary}>
              {t("newAccount.offBudget")}
            </Text>
            <Text variant="captionSm" color={theme.colors.textMuted}>
              {t("newAccount.offBudgetDescription")}
            </Text>
          </View>
          <Switch
            value={offbudget}
            onValueChange={setOffbudget}
            trackColor={{ false: theme.colors.inputBorder, true: theme.colors.primary }}
            thumbColor={theme.colors.cardBackground}
            ios_backgroundColor={theme.colors.inputBorder}
          />
        </View>

        {/* Error */}
        <ErrorBanner error={error} onDismiss={dismissError} />

        {/* Create button */}
        <Button
          title={t("newAccount.createAccount")}
          onPress={handleCreate}
          size="lg"
          loading={loading}
          disabled={!name.trim()}
          style={styles.createButton}
        />
      </ScrollView>

      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button icon="xmark" onPress={() => router.back()} />
      </Stack.Toolbar>
    </>
  );
}

const createStyles = (theme: Theme) => ({
  flex: {
    flex: 1,
    backgroundColor: theme.colors.pageBackground,
  },
  container: {
    padding: theme.spacing.xl,
    gap: theme.spacing.sm,
  },
  label: {
    fontWeight: "600" as const,
    marginTop: theme.spacing.lg,
    marginLeft: theme.spacing.xs,
    marginBottom: theme.spacing.xs,
  },
  hint: {
    lineHeight: 18,
    marginTop: theme.spacing.xs,
    marginLeft: theme.spacing.xs,
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
  createButton: {
    marginTop: theme.spacing.xxl,
  },
});
