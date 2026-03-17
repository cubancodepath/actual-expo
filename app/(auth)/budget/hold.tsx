import { useEffect, useState } from "react";
import { Pressable, View, type ViewStyle } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useTheme } from "@/presentation/providers/ThemeProvider";
import { useBudgetStore } from "@/stores/budgetStore";
import { Text } from "@/presentation/components/atoms/Text";
import { Button } from "@/presentation/components/atoms/Button";
import { IconButton } from "@/presentation/components/atoms/IconButton";
import { Amount } from "@/presentation/components/atoms/Amount";
import { HiddenAmountInput } from "@/presentation/components/transaction/HiddenAmountInput";
import { useAmountInput } from "@/presentation/components/transaction/useAmountInput";
import { CurrencySymbol } from "@/presentation/components/atoms/CurrencySymbol";
import { formatCents, formatExpression } from "@/lib/currency";
import { formatAmountParts } from "@/lib/format";
import { usePreferencesStore } from "@/stores/preferencesStore";
import type { ReactNode } from "react";

function AmountDisplay({
  cents,
  color,
  focused,
  expressionMode,
  fullExpression,
  primaryColor,
  renderCursor,
  onPress,
}: {
  cents: number;
  color: string;
  focused: boolean;
  expressionMode: boolean;
  fullExpression: string;
  primaryColor: string;
  renderCursor: (style: ViewStyle, color: string) => ReactNode;
  onPress: () => void;
}) {
  usePreferencesStore(
    (s) =>
      `${s.numberFormat}:${s.hideFraction}:${s.defaultCurrencyCode}:${s.defaultCurrencyCustomSymbol}:${s.currencySymbolPosition}:${s.currencySpaceBetweenAmountAndSymbol}`,
  );

  return (
    <Pressable onPress={onPress} style={{ alignItems: "center", paddingVertical: 16 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center" }}>
        {expressionMode ? (
          <Text
            style={{
              fontSize: 32,
              lineHeight: 40,
              fontWeight: "700",
              fontVariant: ["tabular-nums"],
              color: primaryColor,
            }}
            numberOfLines={1}
          >
            {formatExpression(fullExpression)}
          </Text>
        ) : (
          (() => {
            const parts = formatAmountParts(cents, false);
            const fontSize = 32;
            return (
              <>
                {parts.svgSymbol && parts.position === "before" && (
                  <>
                    <CurrencySymbol
                      symbol={parts.symbol}
                      svgSymbol={parts.svgSymbol}
                      fontSize={fontSize}
                      color={color}
                    />
                    {parts.spaceBetween && <View style={{ width: Math.round(fontSize / 3) }} />}
                  </>
                )}
                <Text
                  style={{
                    fontSize: 32,
                    lineHeight: 40,
                    fontWeight: "700",
                    fontVariant: ["tabular-nums"],
                    color,
                  }}
                >
                  {parts.svgSymbol ? parts.number : formatCents(cents)}
                </Text>
                {parts.svgSymbol && parts.position === "after" && (
                  <>
                    {parts.spaceBetween && <View style={{ width: Math.round(fontSize / 3) }} />}
                    <CurrencySymbol
                      symbol={parts.symbol}
                      svgSymbol={parts.svgSymbol}
                      fontSize={fontSize}
                      color={color}
                    />
                  </>
                )}
              </>
            );
          })()
        )}
        {renderCursor({ width: 2, height: 28, marginLeft: 2, borderRadius: 1 }, primaryColor)}
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

        <AmountDisplay
          cents={amountInput.cents}
          color={colors.positive}
          focused={amountInput.amountFocused}
          expressionMode={amountInput.expr.expressionMode}
          fullExpression={amountInput.expr.fullExpression}
          primaryColor={colors.primary}
          renderCursor={amountInput.renderCursor}
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
          variant="primary"
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
