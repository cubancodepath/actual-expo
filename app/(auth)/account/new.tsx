import { useState } from "react";
import { Platform, Pressable, ScrollView, Switch, TextInput, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import { Icon } from "@/presentation/components/atoms/Icon";
import { useAccountsStore } from "@/stores/accountsStore";
import { usePayeesStore } from "@/stores/payeesStore";
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
  const { create, load } = useAccountsStore();
  const loadPayees = usePayeesStore((s) => s.load);

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
      await create({ name: trimmed, offbudget, closed: false }, startingBalance);
      await Promise.all([load(), loadPayees()]);
      router.back();
    });
    setLoading(false);
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerLeft: () => (
            <Pressable onPress={() => router.back()} hitSlop={8}>
              <Icon name="close" size={24} color={theme.colors.textSecondary} />
            </Pressable>
          ),
          headerRight: () => (
            <Pressable onPress={handleCreate} hitSlop={8} disabled={!name.trim() || loading}>
              <Text
                variant="body"
                color={name.trim() && !loading ? theme.colors.primary : theme.colors.textMuted}
                style={{ fontWeight: "600", fontSize: 17 }}
              >
                {t("newAccount.create")}
              </Text>
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
        <Text variant="caption" color={theme.colors.textSecondary} style={styles.label}>
          {t("newAccount.accountNameLabel")}
        </Text>
        <TextInput
          style={styles.input}
          placeholder={t("newAccount.accountNamePlaceholder")}
          placeholderTextColor={theme.colors.textMuted}
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
        <View style={styles.balanceInputRow}>
          <Text variant="body" color={theme.colors.textSecondary} style={styles.currencyPrefix}>
            $
          </Text>
          <TextInput
            style={styles.balanceInput}
            placeholder="0.00"
            placeholderTextColor={theme.colors.textMuted}
            value={balanceStr}
            onChangeText={setBalanceStr}
            keyboardType={Platform.OS === "ios" ? "numbers-and-punctuation" : "numeric"}
            returnKeyType="done"
            onSubmitEditing={handleCreate}
          />
        </View>
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
  input: {
    backgroundColor: theme.colors.inputBackground,
    color: theme.colors.textPrimary,
    borderRadius: theme.borderRadius.lg,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    fontSize: 16,
    borderWidth: theme.borderWidth.default,
    borderColor: theme.colors.inputBorder,
  },
  balanceInputRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    backgroundColor: theme.colors.inputBackground,
    borderRadius: theme.borderRadius.lg,
    borderWidth: theme.borderWidth.default,
    borderColor: theme.colors.inputBorder,
    paddingHorizontal: theme.spacing.md,
  },
  currencyPrefix: {
    fontWeight: "600" as const,
    marginRight: theme.spacing.xs,
  },
  balanceInput: {
    flex: 1,
    color: theme.colors.textPrimary,
    fontSize: 16,
    paddingVertical: theme.spacing.md,
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
