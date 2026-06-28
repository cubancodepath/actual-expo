import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useTheme } from "@/design-system/providers/ThemeProvider";
import { useBudgetUIStore } from "@/stores/budgetUIStore";
import { holdForNextMonth } from "@/core/domain/budgets";
import { useSheetValueNumber } from "@/shared/hooks/useSheetValue";
import { sheetForMonth, envelopeBudget } from "@/core/domain/spreadsheet/bindings";
import { Text } from "@/design-system/atoms/Text";
import { Amount } from "@/design-system/atoms/Amount";
import { HiddenAmountInput } from "@/features/transactions/components/HiddenAmountInput";
import { useAmountInput } from "@/features/transactions/components/useAmountInput";
import { CurrencyAmountDisplay } from "@/features/transactions/components/currency-input/CurrencyAmountDisplay";

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
  const { colors, spacing } = useTheme();
  const router = useRouter();
  const { current, maxAmount } = useLocalSearchParams<{ current: string; maxAmount: string }>();

  const currentCents = Number(current) || 0;
  const maxCents = Math.max(Number(maxAmount) || 0, 0);

  const amountInput = useAmountInput(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    amountInput.setCents(currentCents > 0 ? currentCents : maxCents);
  }, []);

  const month = useBudgetUIStore((s) => s.month);
  const sheet = sheetForMonth(month);
  const toBudget = useSheetValueNumber(sheet, envelopeBudget.toBudget);

  async function handleSave() {
    if (amountInput.cents <= 0 || saving) return;
    setSaving(true);
    try {
      await holdForNextMonth(month, amountInput.cents, toBudget);
      router.back();
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <View style={{ flex: 1, backgroundColor: colors.pageBackground, padding: spacing.lg }}>
        <Stack.Screen options={{}} />

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
      </View>

      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button icon="xmark" onPress={() => router.back()} />
      </Stack.Toolbar>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          variant="done"
          tintColor={colors.primary}
          disabled={amountInput.cents <= 0 || saving}
          onPress={handleSave}
        >
          {t("hold")}
        </Stack.Toolbar.Button>
      </Stack.Toolbar>

      <HiddenAmountInput amountInput={amountInput} autoFocus />
    </>
  );
}
