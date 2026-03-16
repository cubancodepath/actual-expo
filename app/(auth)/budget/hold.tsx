import { useEffect, useRef, useState } from "react";
import { Keyboard, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../../src/presentation/providers/ThemeProvider";
import { useBudgetStore } from "../../../src/stores/budgetStore";
import { Text } from "../../../src/presentation/components/atoms/Text";
import { Button } from "../../../src/presentation/components/atoms/Button";
import { IconButton } from "../../../src/presentation/components/atoms/IconButton";
import {
  CurrencyInput,
  type CurrencyInputRef,
} from "../../../src/presentation/components/atoms/CurrencyInput";
import { CalculatorToolbar } from "../../../src/presentation/components/atoms/CalculatorToolbar";
import { GlassButton } from "../../../src/presentation/components/atoms/GlassButton";
import { KeyboardToolbar } from "../../../src/presentation/components/molecules/KeyboardToolbar";
import { Amount } from "../../../src/presentation/components/atoms/Amount";

export default function HoldScreen() {
  const { t } = useTranslation("budget");
  const { colors, spacing, borderRadius: br } = useTheme();
  const router = useRouter();
  const { current, maxAmount } = useLocalSearchParams<{ current: string; maxAmount: string }>();

  const currentCents = Number(current) || 0;
  const maxCents = Math.max(Number(maxAmount) || 0, 0);

  const [cents, setCents] = useState(0);
  const [saving, setSaving] = useState(false);
  const currencyInputRef = useRef<CurrencyInputRef>(null);

  useEffect(() => {
    setCents(currentCents > 0 ? currentCents : maxCents);
  }, []);

  async function handleSave() {
    if (cents <= 0 || saving) return;
    setSaving(true);
    try {
      await useBudgetStore.getState().hold(cents);
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
              <IconButton
                sfSymbol="xmark"
                size={22}
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

        <CurrencyInput
          ref={currencyInputRef}
          value={cents}
          onChangeValue={setCents}
          type="income"
          autoFocus
          style={{ alignSelf: "stretch" }}
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
          variant="primary"
          onPress={handleSave}
          disabled={cents <= 0}
          loading={saving}
          style={{ marginTop: spacing.xl, borderRadius: br.full }}
        />
      </View>

      <KeyboardToolbar>
        <CalculatorToolbar
          onOperator={(op) => currencyInputRef.current?.injectOperator(op)}
          onEvaluate={() => currencyInputRef.current?.evaluate()}
        />
        <View style={{ flex: 1 }} />
        <GlassButton
          icon="checkmark"
          iconSize={16}
          variant="tinted"
          tintColor={colors.primary}
          onPress={() => Keyboard.dismiss()}
        />
      </KeyboardToolbar>
    </>
  );
}
