import { useState, useEffect } from "react";
import { View, FlatList, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useTheme, useThemedStyles } from "@/presentation/providers/ThemeProvider";
import { Text, ListItem, EmptyState, ErrorBanner } from "@/presentation/components";
import { useErrorHandler } from "@/presentation/hooks/useErrorHandler";
import { getSimpleFinAccounts } from "@/bank-sync/service";
import { formatBalance } from "@/lib/format";
import { useTranslation } from "react-i18next";
import type { SimpleFinAccount } from "@/bank-sync/types";
import type { Theme } from "@/theme";

export default function SimpleFinAccountsScreen() {
  const router = useRouter();
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);
  const { t } = useTranslation("bankSync");
  const { error, handleError, dismissError } = useErrorHandler();

  const [accounts, setAccounts] = useState<SimpleFinAccount[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAccounts();
  }, []);

  async function loadAccounts() {
    setLoading(true);
    await handleError(async () => {
      const result = await getSimpleFinAccounts();
      setAccounts(result.accounts ?? []);
    });
    setLoading(false);
  }

  function handleSelect(account: SimpleFinAccount) {
    router.push({
      pathname: "/(auth)/bank-sync/link-account",
      params: {
        provider: "simpleFin",
        remoteAccountId: account.id,
        remoteAccountName: account.name,
        institutionName: account.org.name,
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
      <Text variant="body" color={theme.colors.textSecondary} style={styles.description}>
        {t("simplefin.description")}
      </Text>

      <ErrorBanner error={error} onDismiss={dismissError} onRetry={loadAccounts} />

      <FlatList
        data={accounts}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => (
          <ListItem
            title={item.name}
            subtitle={`${item.org.name} · ${formatBalance(item.balance)}`}
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
  description: {
    padding: theme.spacing.xl,
    paddingBottom: theme.spacing.md,
  },
  list: {
    paddingBottom: 80,
  },
});
