import { useState } from "react";
import { View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useTheme } from "@/presentation/providers/ThemeProvider";
import { lockTransactions, getClearedBalance } from "@/transactions";
import { Text } from "@/presentation/components/atoms/Text";
import { Button } from "@/presentation/components/atoms/Button";
import { Amount } from "@/presentation/components/atoms/Amount";
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
            <Button
              icon="close"
              buttonStyle="borderless"
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
          onPress={handleMatch}
          loading={loading}
          style={{ borderRadius: br.full }}
        />
        <Button
          title={t("reconcile.noEnterBalance")}
          buttonStyle="borderedSecondary"
          onPress={handleEnterBalance}
          style={{ borderRadius: br.full }}
        />
      </View>
    </View>
  );
}
