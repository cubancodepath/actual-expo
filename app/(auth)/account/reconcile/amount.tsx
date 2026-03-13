import { useEffect, useRef, useState } from 'react';
import { Keyboard, Pressable, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import Animated, {
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../../../src/presentation/providers/ThemeProvider';
import { useAccountsStore } from '../../../../src/stores/accountsStore';
import { reconcileAccount } from '../../../../src/transactions';
import { Text } from '../../../../src/presentation/components/atoms/Text';
import { Button } from '../../../../src/presentation/components/atoms/Button';
import { CompactCurrencyInput, type CompactCurrencyInputRef } from '../../../../src/presentation/components/atoms/CompactCurrencyInput';
import { CalculatorToolbar } from '../../../../src/presentation/components/atoms/CalculatorToolbar';
import { GlassButton } from '../../../../src/presentation/components/atoms/GlassButton';
import { KeyboardToolbar } from '../../../../src/presentation/components/molecules/KeyboardToolbar';
import { formatAmount } from '../../../../src/lib/format';
import { useTranslation } from 'react-i18next';

// ---------------------------------------------------------------------------
// Sign Toggle (+/−)
// ---------------------------------------------------------------------------

const TRACK_W = 52;
const TRACK_H = 28;
const THUMB = 22;
const TRAVEL = TRACK_W - THUMB - 6;

function SignToggle({
  isNegative,
  onToggle,
}: {
  isNegative: boolean;
  onToggle: () => void;
}) {
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
      onPress={() => { Haptics.selectionAsync(); onToggle(); }}
      hitSlop={8}
    >
      <Animated.View
        style={[
          {
            width: TRACK_W,
            height: TRACK_H,
            borderRadius: TRACK_H / 2,
            justifyContent: 'center',
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
              backgroundColor: '#ffffff',
              alignItems: 'center',
              justifyContent: 'center',
              shadowColor: '#000',
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
            style={{ fontWeight: '700', fontSize: 16, lineHeight: 18 }}
          >
            {isNegative ? '−' : '+'}
          </Text>
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Amount Screen (Phase 2)
// ---------------------------------------------------------------------------

export default function ReconcileAmountScreen() {
  const { colors, spacing, borderRadius: br } = useTheme();
  const router = useRouter();
  const { accountId, clearedBalance } = useLocalSearchParams<{
    accountId: string;
    clearedBalance: string;
  }>();

  const { t } = useTranslation('accounts');
  const clearedCents = Number(clearedBalance) || 0;

  const [isNegative, setIsNegative] = useState(false);
  const [amountCents, setAmountCents] = useState(0);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<CompactCurrencyInputRef>(null);

  const bankBalance = isNegative ? -amountCents : amountCents;
  const diff = bankBalance - clearedCents;

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 300);
  }, []);

  async function handleReconcile() {
    if (amountCents === 0 || loading) return;
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
          style={{ textAlign: 'center', marginBottom: spacing.xl }}
        >
          {t('reconcile.bankBalanceQuestion')}
        </Text>

        {/* Sign toggle + amount input */}
        <Pressable
          onPress={() => inputRef.current?.focus()}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: colors.cardBackground,
            borderRadius: br.lg,
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.sm,
            gap: spacing.sm,
          }}
        >
          <SignToggle
            isNegative={isNegative}
            onToggle={() => setIsNegative(prev => !prev)}
          />
          <CompactCurrencyInput
            ref={inputRef}
            value={amountCents}
            onChangeValue={setAmountCents}
            color={amountCents > 0 ? (isNegative ? colors.negative : colors.positive) : undefined}
            style={{ flex: 1, justifyContent: 'center' }}
          />
        </Pressable>

        {amountCents > 0 && diff !== 0 && (
          <Text
            variant="captionSm"
            color={colors.textMuted}
            style={{ textAlign: 'right', marginTop: spacing.xs }}
          >
            {t('reconcile.diff', { amount: formatAmount(diff) })}
          </Text>
        )}

        <Button
          title={t('reconcile.reconcileButton')}
          variant="primary"
          onPress={handleReconcile}
          loading={loading}
          disabled={amountCents === 0}
          style={{ marginTop: spacing.xl, borderRadius: br.full }}
        />
      </View>

      <KeyboardToolbar>
        <CalculatorToolbar
          onOperator={(op) => inputRef.current?.injectOperator(op)}
          onEvaluate={() => inputRef.current?.evaluate()}
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
