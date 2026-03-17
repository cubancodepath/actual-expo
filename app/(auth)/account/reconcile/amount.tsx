import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import Animated, {
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/presentation/providers/ThemeProvider";
import { useAccountsStore } from "@/stores/accountsStore";
import { reconcileAccount } from "@/transactions";
import { Text } from "@/presentation/components/atoms/Text";
import { Button } from "@/presentation/components/atoms/Button";
import { useAmountInput } from "@/presentation/components/transaction/useAmountInput";
import { HiddenAmountInput } from "@/presentation/components/transaction/HiddenAmountInput";
import { useCursorBlink } from "@/presentation/hooks/useCursorBlink";
import { formatAmount, formatAmountParts } from "@/lib/format";
import { formatCents, formatExpression } from "@/lib/currency";
import { CurrencySymbol } from "@/presentation/components/atoms/CurrencySymbol";
import { usePreferencesStore } from "@/stores/preferencesStore";
import { useTranslation } from "react-i18next";
import { useRef } from "react";

// ---------------------------------------------------------------------------
// Sign Toggle (+/−)
// ---------------------------------------------------------------------------

const TRACK_W = 52;
const TRACK_H = 28;
const THUMB = 22;
const TRAVEL = TRACK_W - THUMB - 6;

function SignToggle({ isNegative, onToggle }: { isNegative: boolean; onToggle: () => void }) {
  const { colors } = useTheme();
  const progress = useSharedValue(isNegative ? 1 : 0);
  const toggleCount = useRef(0);
  const spin = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(isNegative ? 1 : 0, { duration: 250 });
    toggleCount.current += 1;
    spin.value = withTiming(toggleCount.current * 360, { duration: 350 });
  }, [isNegative]);

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(progress.value, [0, 1], [0, TRAVEL]) },
      { rotate: `${spin.value}deg` },
    ],
  }));

  const trackStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      progress.value,
      [0, 1],
      [colors.positiveSubtle, colors.negativeSubtle],
    ),
  }));

  const symbolColor = isNegative ? colors.negative : colors.positive;

  return (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync();
        onToggle();
      }}
      hitSlop={8}
    >
      <Animated.View
        style={[
          {
            width: TRACK_W,
            height: TRACK_H,
            borderRadius: TRACK_H / 2,
            justifyContent: "center",
            paddingLeft: 3,
          },
          trackStyle,
        ]}
      >
        <Animated.View
          style={[
            {
              width: THUMB,
              height: THUMB,
              borderRadius: THUMB / 2,
              backgroundColor: "#ffffff",
              alignItems: "center",
              justifyContent: "center",
              shadowColor: "#000",
              shadowOpacity: 0.15,
              shadowRadius: 3,
              shadowOffset: { width: 0, height: 1 },
            },
            thumbStyle,
          ]}
        >
          <Text
            variant="body"
            color={symbolColor}
            style={{ fontWeight: "700", fontSize: 16, lineHeight: 18 }}
          >
            {isNegative ? "−" : "+"}
          </Text>
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Inline amount display (replaces CompactCurrencyInput)
// ---------------------------------------------------------------------------

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
  const { renderCursor } = useCursorBlink(focused);
  usePreferencesStore(
    (s) =>
      `${s.numberFormat}:${s.hideFraction}:${s.defaultCurrencyCode}:${s.defaultCurrencyCustomSymbol}:${s.currencySymbolPosition}:${s.currencySpaceBetweenAmountAndSymbol}`,
  );

  return (
    <Pressable
      onPress={onPress}
      style={{ flex: 1, justifyContent: "center", alignItems: "flex-end" }}
    >
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        {expressionMode ? (
          <Text
            variant="body"
            style={{ fontWeight: "600", fontVariant: ["tabular-nums"], color: primaryColor }}
            numberOfLines={1}
          >
            {formatExpression(fullExpression)}
          </Text>
        ) : (
          (() => {
            const parts = formatAmountParts(Math.abs(cents), false);
            const fontSize = 14;
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
                  variant="body"
                  style={{ fontWeight: "600", fontVariant: ["tabular-nums"], color }}
                >
                  {parts.svgSymbol ? parts.number : formatCents(Math.abs(cents))}
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
        {renderCursor({ width: 1.5, height: 16, marginLeft: 1, borderRadius: 1 }, primaryColor)}
      </View>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Amount Screen
// ---------------------------------------------------------------------------

export default function ReconcileAmountScreen() {
  const { colors, spacing, borderRadius: br } = useTheme();
  const router = useRouter();
  const { accountId, clearedBalance } = useLocalSearchParams<{
    accountId: string;
    clearedBalance: string;
  }>();

  const { t } = useTranslation("accounts");
  const clearedCents = Number(clearedBalance) || 0;

  const [isNegative, setIsNegative] = useState(false);
  const [loading, setLoading] = useState(false);
  const amountInput = useAmountInput(0);

  // Auto-focus after mount
  useEffect(() => {
    setTimeout(() => amountInput.sharedInputRef.current?.focus(), 300);
  }, []);

  const bankBalance = isNegative ? -amountInput.cents : amountInput.cents;
  const diff = bankBalance - clearedCents;
  const displayColor =
    amountInput.cents > 0 ? (isNegative ? colors.negative : colors.positive) : colors.textMuted;

  async function handleReconcile() {
    if (amountInput.cents === 0 || loading) return;
    setLoading(true);
    try {
      await reconcileAccount(accountId, bankBalance);
      await useAccountsStore.getState().load();
      router.dismiss(2);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <View style={{ flex: 1, backgroundColor: colors.pageBackground, padding: spacing.lg }}>
        <Text
          variant="body"
          color={colors.textSecondary}
          style={{ textAlign: "center", marginBottom: spacing.xl }}
        >
          {t("reconcile.bankBalanceQuestion")}
        </Text>

        {/* Sign toggle + amount display */}
        <Pressable
          onPress={() => amountInput.sharedInputRef.current?.focus()}
          style={{
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: colors.cardBackground,
            borderRadius: br.lg,
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.sm,
            gap: spacing.sm,
          }}
        >
          <SignToggle isNegative={isNegative} onToggle={() => setIsNegative((prev) => !prev)} />
          <AmountDisplay
            cents={amountInput.cents}
            color={displayColor}
            focused={amountInput.amountFocused}
            expressionMode={amountInput.expr.expressionMode}
            fullExpression={amountInput.expr.fullExpression}
            primaryColor={colors.primary}
            onPress={() => amountInput.sharedInputRef.current?.focus()}
          />
        </Pressable>

        {amountInput.cents > 0 && diff !== 0 && (
          <Text
            variant="captionSm"
            color={colors.textMuted}
            style={{ textAlign: "right", marginTop: spacing.xs }}
          >
            {t("reconcile.diff", { amount: formatAmount(diff) })}
          </Text>
        )}

        <Button
          title={t("reconcile.reconcileButton")}
          variant="primary"
          onPress={handleReconcile}
          loading={loading}
          disabled={amountInput.cents === 0}
          style={{ marginTop: spacing.xl, borderRadius: br.full }}
        />
      </View>

      <HiddenAmountInput amountInput={amountInput} />
    </>
  );
}
