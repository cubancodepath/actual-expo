import { useEffect, useRef, useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  View,
} from 'react-native';
import {
  GlassView,
  isGlassEffectAPIAvailable,
} from 'expo-glass-effect';
import Animated, {
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useTheme, useThemedStyles } from '../../providers/ThemeProvider';
import { Text, Amount } from '..';
import { CompactCurrencyInput, type CompactCurrencyInputRef } from '../atoms/CompactCurrencyInput';
import { formatAmount } from '../../../lib/format';
import type { Theme } from '../../../theme';

interface ReconcileOverlayProps {
  visible: boolean;
  clearedBalance: number;
  onConfirmMatch: () => Promise<void>;
  onReconcile: (bankBalance: number) => Promise<void>;
  onClose: () => void;
}

const glassAvailable = isGlassEffectAPIAvailable();

// ---------------------------------------------------------------------------
// Pill Button (HIG-style full-width action button)
// ---------------------------------------------------------------------------

function PillButton({
  title,
  onPress,
  variant = 'default',
  loading = false,
  disabled = false,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'default' | 'cancel';
  loading?: boolean;
  disabled?: boolean;
}) {
  const { colors, borderRadius } = useTheme();

  const bg =
    variant === 'primary' ? colors.primary :
    variant === 'cancel' ? 'transparent' :
    colors.buttonSecondaryBackground;

  const textColor =
    variant === 'primary' ? colors.primaryText :
    variant === 'cancel' ? colors.textSecondary :
    colors.primary;

  const fontWeight = variant === 'cancel' ? '400' as const : '600' as const;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        {
          backgroundColor: bg,
          borderRadius: borderRadius.lg,
          paddingVertical: 14,
          alignItems: 'center' as const,
          justifyContent: 'center' as const,
          minHeight: 50,
          opacity: disabled ? 0.6 : pressed ? 0.7 : 1,
        },
      ]}
    >
      {loading ? (
        <Text variant="body" color={textColor} style={{ fontWeight }}>...</Text>
      ) : (
        <Text variant="body" color={textColor} style={{ fontWeight }}>
          {title}
        </Text>
      )}
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Sign Toggle (horizontal pill, +/− switch)
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
    // Always land on exact multiple of 360
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
// ReconcileOverlay — two-phase flow
// ---------------------------------------------------------------------------

export function ReconcileOverlay({
  visible,
  clearedBalance,
  onConfirmMatch,
  onReconcile,
  onClose,
}: ReconcileOverlayProps) {
  const theme = useTheme();
  const { colors, spacing } = theme;
  const styles = useThemedStyles(createStyles);

  const [phase, setPhase] = useState<'confirm' | 'amount'>('confirm');
  const [isNegative, setIsNegative] = useState(false);
  const [amountCents, setAmountCents] = useState(0);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<CompactCurrencyInputRef>(null);

  const bankBalance = isNegative ? -amountCents : amountCents;
  const diff = bankBalance - clearedBalance;

  useEffect(() => {
    if (visible) {
      setPhase('confirm');
      setIsNegative(false);
      setAmountCents(0);
      setLoading(false);
    }
  }, [visible]);

  useEffect(() => {
    if (phase === 'amount') {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [phase]);

  if (!visible) return null;

  function handleClose() {
    Keyboard.dismiss();
    onClose();
  }

  async function handleConfirmMatch() {
    setLoading(true);
    try {
      await onConfirmMatch();
      onClose();
    } finally {
      setLoading(false);
    }
  }

  async function handleReconcile() {
    setLoading(true);
    try {
      await onReconcile(bankBalance);
      onClose();
    } finally {
      setLoading(false);
    }
  }

  const CardWrapper = glassAvailable ? GlassView : View;
  const cardWrapperProps = glassAvailable
    ? { glassEffectStyle: 'regular' as const, colorScheme: theme.isDark ? ('dark' as const) : ('light' as const) }
    : {};

  return (
    <View style={styles.overlay}>
      <Pressable style={styles.backdrop} onPress={handleClose} />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <CardWrapper
          style={[styles.card, !glassAvailable && { backgroundColor: colors.cardBackground }]}
          {...cardWrapperProps}
        >
          {phase === 'confirm' ? (
            <>
              <Text variant="headingSm" align="center" style={{ marginBottom: spacing.xs }}>
                Reconcile Account
              </Text>

              <Text
                variant="caption"
                color={colors.textSecondary}
                align="center"
                style={{ marginBottom: spacing.lg }}
              >
                Does your cleared balance match your bank statement?
              </Text>

              <View style={styles.balanceDisplay}>
                <Amount value={clearedBalance} variant="displayLg" colored />
              </View>

              {/* Stacked pill buttons */}
              <View style={styles.pillStack}>
                <PillButton
                  title="Yes, it matches"
                  variant="primary"
                  onPress={handleConfirmMatch}
                  loading={loading}
                />
                <PillButton
                  title="No, enter balance"
                  variant="default"
                  onPress={() => setPhase('amount')}
                />
                <PillButton
                  title="Cancel"
                  variant="cancel"
                  onPress={handleClose}
                />
              </View>
            </>
          ) : (
            <>
              <Text variant="headingSm" align="center" style={{ marginBottom: spacing.xs }}>
                Enter Bank Balance
              </Text>

              <Text
                variant="caption"
                color={colors.textSecondary}
                align="center"
                style={{ marginBottom: spacing.lg }}
              >
                What is your current bank balance?
              </Text>

              {/* Sign toggle + amount input */}
              <Pressable
                onPress={() => inputRef.current?.focus()}
                style={styles.amountRow}
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
                  align="right"
                  style={{ marginTop: spacing.xs }}
                >
                  Diff: {formatAmount(diff)}
                </Text>
              )}

              {/* Stacked pill buttons */}
              <View style={styles.pillStack}>
                <PillButton
                  title="Reconcile"
                  variant="primary"
                  onPress={handleReconcile}
                  loading={loading}
                  disabled={amountCents === 0}
                />
                <PillButton
                  title="Cancel"
                  variant="cancel"
                  onPress={handleClose}
                />
              </View>
            </>
          )}
        </CardWrapper>
      </KeyboardAvoidingView>
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  overlay: {
    ...({ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 100 } as const),
  },
  backdrop: {
    ...({ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)' } as const),
  },
  keyboardView: {
    flex: 1,
    justifyContent: 'center' as const,
    paddingHorizontal: theme.spacing.xl,
  },
  card: {
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing.xl,
    overflow: 'hidden' as const,
    ...theme.shadows.elevated,
  },
  balanceDisplay: {
    alignItems: 'center' as const,
    marginBottom: theme.spacing.xl,
    paddingVertical: theme.spacing.sm,
  },
  amountRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: theme.colors.pageBackground,
    borderRadius: theme.borderRadius.lg,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    gap: theme.spacing.sm,
  },
  pillStack: {
    gap: theme.spacing.xs,
    marginTop: theme.spacing.lg,
  },
});
