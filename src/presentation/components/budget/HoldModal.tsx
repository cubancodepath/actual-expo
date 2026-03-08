import { useEffect, useRef, useState } from 'react';
import { Keyboard, Modal, Pressable, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { useTheme } from '../../providers/ThemeProvider';
import { Text } from '../atoms/Text';
import { CurrencyInput, type CurrencyInputRef } from '../atoms/CurrencyInput';
import { CalculatorToolbar } from '../atoms/CalculatorToolbar';
import { GlassButton } from '../atoms/GlassButton';
import { KeyboardToolbar } from '../molecules/KeyboardToolbar';

interface HoldModalProps {
  visible: boolean;
  current: number;
  maxAmount: number;
  onSave: (amount: number) => void;
  onClose: () => void;
}

export function HoldModal({ visible, current, maxAmount, onSave, onClose }: HoldModalProps) {
  const { colors, spacing, borderRadius: br, borderWidth: bw, isDark } = useTheme();
  const [cents, setCents] = useState(0);
  const glass = isLiquidGlassAvailable();
  const currencyInputRef = useRef<CurrencyInputRef>(null);

  useEffect(() => {
    if (visible) {
      setCents(current > 0 ? current : Math.max(maxAmount, 0));
    }
  }, [visible, current, maxAmount]);

  function handleSave() {
    if (cents > 0) {
      onSave(cents);
    }
    onClose();
  }

  const max = (Math.max(maxAmount, 0) / 100).toFixed(2);

  const cardStyle = {
    borderRadius: br.xl,
    padding: spacing.xl,
    width: '85%' as const,
    gap: spacing.lg,
    overflow: 'hidden' as const,
  };

  const content = (
    <>
      <Text variant="headingSm">Hold for Next Month</Text>
      <Text variant="bodySm" color={colors.textMuted}>
        Reserve money from Ready to Assign to carry it into next month.
      </Text>

      <CurrencyInput
        ref={currencyInputRef}
        value={cents}
        onChangeValue={setCents}
        type="income"
        autoFocus
      />

      <Text variant="captionSm" color={colors.textMuted} style={{ textAlign: 'center' }}>
        Available to hold:{' '}
        <Text variant="captionSm" color={colors.primary} style={{ fontWeight: '700' }}>
          ${max}
        </Text>
      </Text>

      <View style={{ flexDirection: 'row', gap: 10, marginTop: spacing.xs }}>
        <Pressable
          style={{
            flex: 1,
            paddingVertical: 12,
            alignItems: 'center',
            borderRadius: br.full,
            borderWidth: bw.thin,
            borderColor: colors.cardBorder,
          }}
          onPress={onClose}
        >
          <Text variant="bodyLg" color={colors.textSecondary} style={{ fontWeight: '600' }}>
            Cancel
          </Text>
        </Pressable>
        <Pressable
          style={{
            flex: 1,
            paddingVertical: 12,
            alignItems: 'center',
            borderRadius: br.full,
            backgroundColor: colors.primary,
          }}
          onPress={handleSave}
        >
          <Text variant="bodyLg" color={colors.primaryText} style={{ fontWeight: '700' }}>
            Hold
          </Text>
        </Pressable>
      </View>
    </>
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        style={{ flex: 1, backgroundColor: colors.modalOverlay, justifyContent: 'center', alignItems: 'center' }}
        onPress={onClose}
      >
        <Pressable onPress={(e) => e.stopPropagation()}>
          {glass ? (
            <GlassView
              glassEffectStyle="regular"
              colorScheme={isDark ? 'dark' : 'light'}
              style={cardStyle}
            >
              {content}
            </GlassView>
          ) : (
            <BlurView
              tint="systemChromeMaterial"
              intensity={100}
              style={[cardStyle, { borderWidth: bw.thin, borderColor: colors.cardBorder }]}
            >
              {content}
            </BlurView>
          )}
        </Pressable>
      </Pressable>
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
    </Modal>
  );
}
