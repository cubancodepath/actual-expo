import { useEffect, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import Animated, {
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  useReducedMotion,
  withSpring,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/presentation/providers/ThemeProvider";
import { reconcileAccount } from "@/transactions";
import { Text } from "@/presentation/components/atoms/Text";
import { Amount } from "@/presentation/components/atoms/Amount";
import { Icon } from "@/presentation/components/atoms/Icon";
import { useAmountInput } from "@/presentation/components/transaction/useAmountInput";
import { HiddenAmountInput } from "@/presentation/components/transaction/HiddenAmountInput";
import { CurrencyAmountDisplay } from "@/presentation/components/currency-input/CurrencyAmountDisplay";
import { formatAmount } from "@/lib/format";
import { useTranslation } from "react-i18next";

// ---------------------------------------------------------------------------
// Sign Toggle (+/−)
// ---------------------------------------------------------------------------

const TRACK_W = 52;
const TRACK_H = 28;
const THUMB = 22;
const TRAVEL = TRACK_W - THUMB - 6;

function SignToggle({ isNegative, onToggle }: { isNegative: boolean; onToggle: () => void }) {
  const { colors } = useTheme();
  const reducedMotion = useReducedMotion();
  const progress = useSharedValue(isNegative ? 1 : 0);

  useEffect(() => {
    progress.value = reducedMotion
      ? isNegative
        ? 1
        : 0
      : withSpring(isNegative ? 1 : 0, { damping: 20, stiffness: 300 });
  }, [isNegative]);

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(progress.value, [0, 1], [0, TRAVEL]) }],
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
              backgroundColor: colors.elevatedBackground,
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

  const [isNegative, setIsNegative] = useState(clearedCents < 0);
  const [loading, setLoading] = useState(false);
  const amountInput = useAmountInput(Math.abs(clearedCents));

  // Auto-focus after mount
  useEffect(() => {
    setTimeout(() => amountInput.sharedInputRef.current?.focus(), 300);
  }, []);

  const bankBalance = isNegative ? -amountInput.cents : amountInput.cents;
  const diff = bankBalance - clearedCents;
  const displayColor =
    amountInput.cents > 0 ? (isNegative ? colors.negative : colors.positive) : colors.textMuted;

  // Diff pill state
  const hasDiff = amountInput.cents > 0 && diff !== 0;
  const isBalanced = amountInput.cents > 0 && diff === 0;
  const diffPillBg = isBalanced
    ? colors.positiveSubtle
    : hasDiff
      ? colors.warningSubtle
      : "transparent";
  const diffPillColor = isBalanced ? colors.positive : colors.warning;

  async function handleReconcile() {
    if (amountInput.cents === 0 || loading) return;
    setLoading(true);
    try {
      await reconcileAccount(accountId, bankBalance);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.dismiss(2);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <View style={{ flex: 1, backgroundColor: colors.pageBackground, padding: spacing.lg }}>
        <Stack.Screen options={{}} />

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
          <View style={{ flex: 1, justifyContent: "center", alignItems: "flex-end" }}>
            <CurrencyAmountDisplay
              amount={amountInput.cents}
              isActive={amountInput.amountFocused}
              expressionMode={amountInput.expr.expressionMode}
              fullExpression={amountInput.expr.fullExpression}
              color={displayColor}
              primaryColor={colors.primary}
            />
          </View>
        </Pressable>

        {/* Diff pill */}
        {(isBalanced || hasDiff) && (
          <View style={{ alignItems: "center", marginTop: spacing.md }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                backgroundColor: diffPillBg,
                borderRadius: br.full,
                paddingHorizontal: spacing.sm,
                paddingVertical: spacing.xs,
                gap: spacing.xs,
              }}
            >
              {isBalanced ? (
                <>
                  <Icon name="checkmarkCircle" size={14} color={diffPillColor} />
                  <Text variant="captionSm" color={diffPillColor} style={{ fontWeight: "600" }}>
                    {t("reconcile.diffZero")}
                  </Text>
                </>
              ) : (
                <Text variant="captionSm" color={diffPillColor} style={{ fontWeight: "600" }}>
                  {diff > 0
                    ? t("reconcile.diffPositive", { amount: formatAmount(Math.abs(diff)) })
                    : t("reconcile.diffNegative", { amount: formatAmount(Math.abs(diff)) })}
                </Text>
              )}
            </View>

            {hasDiff && (
              <Text
                variant="captionSm"
                color={colors.textMuted}
                style={{ marginTop: spacing.xs, textAlign: "center" }}
              >
                {t("reconcile.adjustmentNotice")}
              </Text>
            )}
          </View>
        )}
      </View>

      {/* Toolbar */}
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button icon="chevron.left" onPress={() => router.back()} />
      </Stack.Toolbar>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          variant="done"
          tintColor={colors.primary}
          disabled={amountInput.cents === 0 || loading}
          onPress={handleReconcile}
        >
          {t("reconcile.reconcileButton")}
        </Stack.Toolbar.Button>
      </Stack.Toolbar>

      <HiddenAmountInput amountInput={amountInput} />
    </>
  );
}
