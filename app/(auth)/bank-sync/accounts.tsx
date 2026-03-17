import { useState, useEffect } from "react";
import { View, FlatList, ActivityIndicator } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useTheme, useThemedStyles } from "@/presentation/providers/ThemeProvider";
import { ListItem, EmptyState, ErrorBanner } from "@/presentation/components";
import { useErrorHandler } from "@/presentation/hooks/useErrorHandler";
import { getGoCardlessAccounts } from "@/bank-sync/service";
import { useTranslation } from "react-i18next";
import type { GoCardlessAccount } from "@/bank-sync/types";
import type { Theme } from "@/theme";

export default function AccountsScreen() {
  const { requisitionId, institutionName } = useLocalSearchParams<{
    requisitionId: string;
    institutionName: string;
  }>();
  const router = useRouter();
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);
  const { t } = useTranslation("bankSync");
  const { error, handleError, dismissError } = useErrorHandler();

  const [accounts, setAccounts] = useState<GoCardlessAccount[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAccounts();
  }, [requisitionId]);

  async function loadAccounts() {
    setLoading(true);
    await handleError(async () => {
      const result = await getGoCardlessAccounts(requisitionId);
      setAccounts(result.accounts ?? []);
    });
    setLoading(false);
  }

  function handleSelect(account: GoCardlessAccount) {
    router.push({
      pathname: "/(auth)/bank-sync/link-account",
      params: {
        provider: "goCardless",
        remoteAccountId: account.id,
        remoteAccountName: account.name ?? account.iban ?? account.id,
        requisitionId,
        institutionName: institutionName ?? "Bank",
      },
    });
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ErrorBanner error={error} onDismiss={dismissError} onRetry={loadAccounts} />
      <FlatList
        data={accounts}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => (
          <ListItem
            title={item.name ?? item.id}
            subtitle={item.iban ?? undefined}
            showChevron
            showSeparator={index < accounts.length - 1}
            onPress={() => handleSelect(item)}
          />
        )}
        ListEmptyComponent={
          <EmptyState
            icon="wallet-outline"
            title={t("accounts.noAccounts")}
            description={t("accounts.noAccountsDescription")}
          />
        }
        contentContainerStyle={styles.list}
      />
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.pageBackground,
  },
  center: {
    flex: 1,
    backgroundColor: theme.colors.pageBackground,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  list: {
    paddingBottom: 80,
  },
});
