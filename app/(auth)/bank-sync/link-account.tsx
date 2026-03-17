import { useState } from "react";
import { View, FlatList } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme, useThemedStyles } from "@/presentation/providers/ThemeProvider";
import { Text, Button, ListItem, ErrorBanner } from "@/presentation/components";
import { useErrorHandler } from "@/presentation/hooks/useErrorHandler";
import { useAccountsStore } from "@/stores/accountsStore";
import { linkAccount } from "@/bank-sync";
import { useTranslation } from "react-i18next";
import type { BankSyncProvider } from "@/bank-sync/types";
import type { Theme } from "@/theme";

export default function LinkAccountScreen() {
  const {
    provider,
    remoteAccountId,
    remoteAccountName,
    requisitionId,
    institutionName,
  } = useLocalSearchParams<{
    provider: string;
    remoteAccountId: string;
    remoteAccountName: string;
    requisitionId?: string;
    institutionName?: string;
  }>();
  const router = useRouter();
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);
  const { t } = useTranslation("bankSync");
  const { t: tc } = useTranslation("common");
  const { error, handleError, dismissError } = useErrorHandler();
  const { accounts, load } = useAccountsStore();

  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);

  // Only show non-closed, non-linked accounts
  const availableAccounts = accounts.filter(
    (a) => !a.closed && !a.tombstone && !a.accountSyncSource,
  );

  async function handleLink() {
    if (!selectedAccountId) return;

    setLinking(true);
    await handleError(async () => {
      await linkAccount(
        selectedAccountId,
        provider as BankSyncProvider,
        remoteAccountId,
        institutionName,
        requisitionId,
      );
      await load();
      // Navigate back to root (dismiss entire bank-sync stack)
      router.dismissAll();
    });
    setLinking(false);
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Ionicons name="link-outline" size={32} color={theme.colors.primary} />
        <Text variant="bodyLg" color={theme.colors.textPrimary} style={styles.bankName}>
          {remoteAccountName}
        </Text>
        <Text variant="body" color={theme.colors.textSecondary}>
          {t("linkAccount.description")}
        </Text>
      </View>

      <ErrorBanner error={error} onDismiss={dismissError} />

      <FlatList
        data={availableAccounts}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => (
          <ListItem
            title={item.name}
            checkmark={selectedAccountId === item.id}
            showSeparator={index < availableAccounts.length - 1}
            onPress={() => setSelectedAccountId(item.id)}
          />
        )}
        contentContainerStyle={styles.list}
      />

      <View style={styles.actions}>
        <Button
          title={tc("confirm")}
          onPress={handleLink}
          size="lg"
          loading={linking}
          disabled={!selectedAccountId}
        />
      </View>
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.pageBackground,
  },
  header: {
    padding: theme.spacing.xl,
    alignItems: "center" as const,
    gap: theme.spacing.sm,
  },
  bankName: {
    fontWeight: "600" as const,
  },
  list: {
    paddingBottom: 20,
  },
  actions: {
    padding: theme.spacing.xl,
    paddingBottom: theme.spacing.xxl,
  },
});
