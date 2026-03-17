import { useState } from "react";
import { View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useTheme } from "@/presentation/providers/ThemeProvider";
import { useAccountsStore } from "@/stores/accountsStore";
import { lockTransactions, getClearedBalance } from "@/transactions";
import { Text } from "@/presentation/components/atoms/Text";
import { Button } from "@/presentation/components/atoms/Button";
import { Amount } from "@/presentation/components/atoms/Amount";
import { IconButton } from "@/presentation/components/atoms/IconButton";
import { useTranslation } from "react-i18next";

export default function ReconcileConfirmScreen() {
  const { colors, spacing, borderRadius: br } = useTheme();
  const router = useRouter();
  const { accountId, clearedBalance } = useLocalSearchParams<{
    accountId: string;
    clearedBalance: string;
  }>();

  const { t } = useTranslation("accounts");
  const clearedCents = Number(clearedBalance) || 0;
  const [loading, setLoading] = useState(false);

  async function handleMatch() {
    if (loading) return;
    setLoading(true);
    try {
      await lockTransactions(accountId);
      await useAccountsStore.getState().load();
      router.dismiss();
    } finally {
      setLoading(false);
    }
  }

  function handleEnterBalance() {
    router.push({
      pathname: "/(auth)/account/reconcile/amount",
      params: { accountId, clearedBalance },
    });
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.pageBackground, padding: spacing.lg }}>
      <Stack.Screen
        options={{
          headerLeft: () => (
            <IconButton
              name="close"
              size={22}
              color={colors.headerText}
              onPress={() => router.dismiss()}
            />
          ),
        }}
      />

      <Text
        variant="body"
        color={colors.textSecondary}
        style={{ textAlign: "center", marginBottom: spacing.xl }}
      >
        {t("reconcile.question")}
      </Text>

      <View style={{ alignItems: "center", marginBottom: spacing.xl, paddingVertical: spacing.md }}>
        <Amount value={clearedCents} variant="displayLg" colored />
      </View>

      <View style={{ gap: spacing.sm }}>
        <Button
          title={t("reconcile.yesMatches")}
          variant="primary"
          onPress={handleMatch}
          loading={loading}
          style={{ borderRadius: br.full }}
        />
        <Button
          title={t("reconcile.noEnterBalance")}
          variant="secondary"
          onPress={handleEnterBalance}
          style={{ borderRadius: br.full }}
        />
      </View>
    </View>
  );
}
