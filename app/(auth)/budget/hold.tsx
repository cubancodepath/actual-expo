import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useTheme } from "@/presentation/providers/ThemeProvider";
import { useBudgetStore } from "@/stores/budgetStore";
import { Text } from "@/presentation/components/atoms/Text";
import { Button } from "@/presentation/components/atoms/Button";
import { Amount } from "@/presentation/components/atoms/Amount";
import { HiddenAmountInput } from "@/presentation/components/transaction/HiddenAmountInput";
import { useAmountInput } from "@/presentation/components/transaction/useAmountInput";
import { CurrencyAmountDisplay } from "@/presentation/components/currency-input/CurrencyAmountDisplay";

function AmountDisplay({
  cents,
  color,
  focused,
  expressionMode,
  fullExpression,
  primaryColor,
  onPress,
}: {
  cents: number;
  color: string;
  focused: boolean;
  expressionMode: boolean;
  fullExpression: string;
  primaryColor: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={{ alignItems: "center", paddingVertical: 16 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center" }}>
        <CurrencyAmountDisplay
          amount={cents}
          isActive={focused}
          expressionMode={expressionMode}
          fullExpression={fullExpression}
          color={color}
          primaryColor={primaryColor}
          fontSize={32}
        />
      </View>
    </Pressable>
  );
}

export default function HoldScreen() {
  const { t } = useTranslation("budget");
  const { colors, spacing, borderRadius: br } = useTheme();
  const router = useRouter();
  const { current, maxAmount } = useLocalSearchParams<{ current: string; maxAmount: string }>();

  const currentCents = Number(current) || 0;
  const maxCents = Math.max(Number(maxAmount) || 0, 0);

  const amountInput = useAmountInput(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    amountInput.setCents(currentCents > 0 ? currentCents : maxCents);
  }, []);

  async function handleSave() {
    if (amountInput.cents <= 0 || saving) return;
    setSaving(true);
    try {
      await useBudgetStore.getState().hold(amountInput.cents);
      router.back();
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <View style={{ flex: 1, backgroundColor: colors.pageBackground, padding: spacing.lg }}>
        <Stack.Screen
          options={{
            headerLeft: () => (
              <Button
                icon="close"
                buttonStyle="borderless"
                color={colors.headerText}
                onPress={() => router.back()}
              />
            ),
          }}
        />

        <Text
          variant="bodySm"
          color={colors.textMuted}
          style={{ textAlign: "center", marginBottom: spacing.lg }}
        >
          {t("reserveDescription")}
        </Text>

        <AmountDisplay
          cents={amountInput.cents}
          color={colors.positive}
          focused={amountInput.amountFocused}
          expressionMode={amountInput.expr.expressionMode}
          fullExpression={amountInput.expr.fullExpression}
          primaryColor={colors.primary}
          onPress={() => amountInput.sharedInputRef.current?.focus()}
        />

        <View
          style={{
            flexDirection: "row",
            justifyContent: "center",
            alignItems: "center",
            marginTop: spacing.sm,
          }}
        >
          <Text variant="captionSm" color={colors.textMuted}>
            {t("availableToHold")}
          </Text>
          <Amount value={maxCents} variant="captionSm" color={colors.primary} weight="700" />
        </View>

        <Button
          title={t("hold")}
          onPress={handleSave}
          disabled={amountInput.cents <= 0}
          loading={saving}
          style={{ marginTop: spacing.xl, borderRadius: br.full }}
        />
      </View>

      <HiddenAmountInput amountInput={amountInput} autoFocus />
    </>
  );
}
