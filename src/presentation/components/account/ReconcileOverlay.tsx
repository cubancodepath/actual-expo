import { useEffect, useRef, useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  TextInput,
  View,
} from 'react-native';
import {
  GlassView,
  isGlassEffectAPIAvailable,
} from 'expo-glass-effect';
import { useTheme, useThemedStyles } from '../../providers/ThemeProvider';
import { Text, Button, Amount } from '..';
import { formatAmount, parseCents } from '../../../lib/format';
import type { Theme } from '../../../theme';

interface ReconcileOverlayProps {
  visible: boolean;
  clearedBalance: number;
  onReconcile: (bankBalance: number) => Promise<void>;
  onClose: () => void;
}

const glassAvailable = isGlassEffectAPIAvailable();

export function ReconcileOverlay({
  visible,
  clearedBalance,
  onReconcile,
  onClose,
}: ReconcileOverlayProps) {
  const theme = useTheme();
  const { colors, spacing } = theme;
  const styles = useThemedStyles(createStyles);
  const inputRef = useRef<TextInput>(null);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);

  const bankBalance = parseCents(inputValue);
  const diff = bankBalance - clearedBalance;
  const hasDiff = inputValue.trim() !== '' && diff !== 0;

  useEffect(() => {
    if (visible) {
      const dollars = (Math.abs(clearedBalance) / 100).toFixed(2);
      setInputValue(clearedBalance < 0 ? `-${dollars}` : dollars);
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [visible, clearedBalance]);

  if (!visible) return null;

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
      {/* Dimmed backdrop */}
      <Pressable
        style={styles.backdrop}
        onPress={() => { Keyboard.dismiss(); onClose(); }}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <CardWrapper
          style={[styles.card, !glassAvailable && { backgroundColor: colors.cardBackground }]}
          {...cardWrapperProps}
        >
          {/* Cleared balance — compact row */}
          <View style={styles.clearedRow}>
            <Text variant="caption" color={colors.textSecondary}>Cleared</Text>
            <Amount value={clearedBalance} variant="bodyLg" />
          </View>

          {/* Input */}
          <Text variant="caption" color={colors.textSecondary} style={{ marginBottom: spacing.xs }}>
            Bank balance
          </Text>
          <View style={styles.inputContainer}>
            <Text variant="body" color={colors.textMuted}>$</Text>
            <TextInput
              ref={inputRef}
              style={[styles.input, { color: colors.textPrimary }]}
              value={inputValue}
              onChangeText={setInputValue}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor={colors.textMuted}
              selectionColor={colors.primary}
            />
          </View>

          {hasDiff && (
            <Text variant="captionSm" color={colors.textMuted} style={{ marginTop: spacing.xs, textAlign: 'right' }}>
              Diff: {formatAmount(diff)}
            </Text>
          )}

          {/* Buttons */}
          <View style={styles.buttons}>
            <Button title="Cancel" variant="ghost" size="sm" onPress={onClose} style={{ flex: 1 }} />
            <Button
              title="Reconcile"
              variant="primary"
              size="sm"
              onPress={handleReconcile}
              loading={loading}
              disabled={inputValue.trim() === ''}
              style={{ flex: 1 }}
            />
          </View>
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
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.lg,
    overflow: 'hidden' as const,
    ...theme.shadows.elevated,
  },
  clearedRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    marginBottom: theme.spacing.md,
    paddingBottom: theme.spacing.md,
    borderBottomWidth: theme.borderWidth.thin,
    borderBottomColor: theme.colors.divider,
  },
  inputContainer: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: theme.colors.pageBackground,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    gap: theme.spacing.xs,
  },
  input: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600' as const,
    paddingVertical: theme.spacing.xxs,
  },
  buttons: {
    flexDirection: 'row' as const,
    marginTop: theme.spacing.md,
    gap: theme.spacing.sm,
  },
});
