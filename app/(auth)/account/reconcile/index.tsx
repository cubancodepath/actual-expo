import { useState } from "react";
import { View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/presentation/providers/ThemeProvider";
import { lockTransactions } from "@/transactions";
import { Text } from "@/presentation/components/atoms/Text";
import { Button } from "@/presentation/components/atoms/Button";
import { Amount } from "@/presentation/components/atoms/Amount";
import { Icon } from "@/presentation/components/atoms/Icon";
import { useTranslation } from "react-i18next";

export default function ReconcileConfirmScreen() {
  const { colors, spacing, borderRadius: br, borderWidth: bw } = useTheme();
  const router = useRouter();
  const { accountId, clearedBalance, clearedCount, lastReconciled } = useLocalSearchParams<{
    accountId: string;
    clearedBalance: string;
    clearedCount: string;
    lastReconciled: string;
  }>();

  const { t } = useTranslation("accounts");
  const clearedCents = Number(clearedBalance) || 0;
  const count = Number(clearedCount) || 0;
  const [loading, setLoading] = useState(false);

  // Format last reconciled date
  const lastReconciledLabel = lastReconciled
    ? t("reconcile.lastReconciled", {
        date: new Date(Number(lastReconciled)).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
        }),
      })
    : t("reconcile.neverReconciled");

  async function handleMatch() {
    if (loading) return;
    setLoading(true);
    try {
      await lockTransactions(accountId);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
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
      <Stack.Screen options={{}} />

      {/* Hero card with cleared balance */}
      <View
        style={{
          backgroundColor: colors.cardBackground,
          borderRadius: br.lg,
          paddingHorizontal: spacing.lg,
          paddingVertical: spacing.xl,
          alignItems: "center",
          marginBottom: spacing.lg,
        }}
      >
        <Text
          variant="captionSm"
          color={colors.textMuted}
          style={{
            textTransform: "uppercase",
            letterSpacing: 1.2,
            fontWeight: "700",
            marginBottom: spacing.sm,
          }}
        >
          {t("reconcile.title")}
        </Text>

        <Amount
          value={clearedCents}
          variant="displayLg"
          colored
          weight="700"
          style={{ fontSize: 40, lineHeight: 48 }}
        />

        <View
          style={{
            height: bw.thin,
            backgroundColor: colors.divider,
            alignSelf: "stretch",
            marginVertical: spacing.md,
          }}
        />

        <Text variant="captionSm" color={colors.textMuted}>
          {lastReconciledLabel}
        </Text>

        {count > 0 && (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: spacing.xs,
              marginTop: spacing.xs,
            }}
          >
            <Icon name="lockClosed" size={12} color={colors.textMuted} />
            <Text variant="captionSm" color={colors.textMuted}>
              {t("reconcile.transactionsToLock", { count })}
            </Text>
          </View>
        )}
      </View>

      {/* Question */}
      <Text
        variant="body"
        color={colors.textSecondary}
        style={{ textAlign: "center", marginBottom: spacing.sm }}
      >
        {t("reconcile.question")}
      </Text>

      {/* Helper text */}
      <Text
        variant="captionSm"
        color={colors.textMuted}
        style={{ textAlign: "center", marginBottom: spacing.xl }}
      >
        {t("reconcile.helperText")}
      </Text>

      {/* Actions */}
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
