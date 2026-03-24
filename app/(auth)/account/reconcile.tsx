import { useEffect, useState } from "react";
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
import { lockTransactions, reconcileAccount } from "@core/transactions";
import { Text } from "@/presentation/components/atoms/Text";
import { Amount } from "@/presentation/components/atoms/Amount";
import { useAmountInput } from "@/presentation/components/transaction/useAmountInput";
import { HiddenAmountInput } from "@/presentation/components/transaction/HiddenAmountInput";
import { CurrencyAmountDisplay } from "@/presentation/components/currency-input/CurrencyAmountDisplay";
import { formatAmount } from "@/lib/format";
import { formatDistanceToNow, format } from "date-fns";
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
// Reconcile Screen
// ---------------------------------------------------------------------------

export default function ReconcileScreen() {
  const { colors, spacing, borderRadius: br, borderWidth: bw, sizes } = useTheme();
  const router = useRouter();
  const { accountId, clearedBalance, lastReconciled } = useLocalSearchParams<{
    accountId: string;
    clearedBalance: string;
    lastReconciled: string;
  }>();

  const { t } = useTranslation("accounts");
  const clearedCents = Number(clearedBalance) || 0;

  // Human-readable last reconciled
  const lastReconciledText =
    lastReconciled && lastReconciled !== ""
      ? (() => {
          const ts = Number(lastReconciled);
          const date = isNaN(ts) ? new Date(lastReconciled) : new Date(ts);
          if (isNaN(date.getTime())) return null;
          const relative = formatDistanceToNow(date, { addSuffix: true });
          const dateStr = format(date, "MMM d");
          return `${relative} (${dateStr})`;
        })()
      : null;
  const [loading, setLoading] = useState(false);

  const [isNegative, setIsNegative] = useState(clearedCents < 0);
  const amountInput = useAmountInput(Math.abs(clearedCents));

  const bankBalance = isNegative ? -amountInput.cents : amountInput.cents;
  const diff = bankBalance - clearedCents;
  const isBalanced = amountInput.cents > 0 && diff === 0;

  const displayColor =
    amountInput.cents > 0 ? (isNegative ? colors.negative : colors.positive) : colors.textMuted;

  async function handleReconcile() {
    if (amountInput.cents === 0 || loading) return;
    setLoading(true);
    try {
      if (diff === 0) {
        await lockTransactions(accountId);
      } else {
        await reconcileAccount(accountId, bankBalance);
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.dismiss();
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <View
        style={{
          flex: 1,
          backgroundColor: colors.pageBackground,
          paddingHorizontal: spacing.lg,
          paddingTop: 72,
          paddingBottom: spacing.lg,
        }}
      >
        <Stack.Screen options={{}} />

        {/* Question */}
        <Text variant="bodySm" color={colors.textMuted} style={{ marginBottom: spacing.lg }}>
          {t("reconcile.bankBalanceQuestion")}
        </Text>

        {/* Amount input — app standard input style with sign toggle as icon */}
        <Pressable
          onPress={() => amountInput.sharedInputRef.current?.focus()}
          style={{
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: colors.inputBackground,
            borderRadius: br.full,
            borderWidth: bw.default,
            borderColor: colors.inputBorder,
            paddingHorizontal: spacing.md,
            minHeight: sizes.control,
            gap: spacing.sm,
          }}
        >
          <SignToggle isNegative={isNegative} onToggle={() => setIsNegative((prev) => !prev)} />
          <View style={{ flex: 1, alignItems: "flex-end", paddingVertical: spacing.md }}>
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

        {/* Last reconciled */}
        {lastReconciledText && (
          <Text variant="captionSm" color={colors.textMuted} style={{ marginTop: spacing.sm }}>
            Last reconciled {lastReconciledText}
          </Text>
        )}
      </View>

      {/* Toolbar */}
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button icon="xmark" onPress={() => router.dismiss()} />
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
