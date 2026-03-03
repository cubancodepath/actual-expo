import { useEffect, useState } from 'react';
import { Modal, Pressable, TextInput, View } from 'react-native';
import { useTheme } from '../../providers/ThemeProvider';
import { Text } from '../atoms/Text';

interface HoldModalProps {
  visible: boolean;
  current: number;
  maxAmount: number;
  onSave: (amount: number) => void;
  onClose: () => void;
}

export function HoldModal({ visible, current, maxAmount, onSave, onClose }: HoldModalProps) {
  const { colors, spacing, borderRadius: br, borderWidth: bw } = useTheme();
  const [value, setValue] = useState('');

  useEffect(() => {
    if (visible) {
      setValue(current > 0 ? (current / 100).toFixed(2) : '');
    }
  }, [visible, current]);

  function handleSave() {
    const cents = Math.round(parseFloat(value.replace(/[^0-9.]/g, '')) * 100);
    if (!isNaN(cents) && cents >= 0) {
      onSave(cents);
    }
    onClose();
  }

  const max = (maxAmount / 100).toFixed(2);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        style={{ flex: 1, backgroundColor: colors.modalOverlay, justifyContent: 'center', alignItems: 'center' }}
        onPress={onClose}
      >
        <Pressable
          style={{
            backgroundColor: colors.cardBackground,
            borderRadius: br.xl,
            padding: spacing.xl,
            width: '85%',
            gap: spacing.lg,
            borderWidth: bw.thin,
            borderColor: colors.cardBorder,
          }}
          onPress={(e) => e.stopPropagation()}
        >
          <Text variant="headingSm">Hold for Next Month</Text>
          <Text variant="bodySm" color={colors.textMuted}>
            Move money from "To Budget" to next month.{'\n'}
            Available to hold:{' '}
            <Text variant="bodySm" color={colors.primary} style={{ fontWeight: '700' }}>
              ${max}
            </Text>
          </Text>

          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              backgroundColor: colors.pageBackground,
              borderRadius: br.lg,
              paddingHorizontal: 14,
              paddingVertical: 12,
              borderWidth: bw.thin,
              borderColor: colors.cardBorder,
            }}
          >
            <Text variant="headingLg" color={colors.primary}>$</Text>
            <TextInput
              style={{ flex: 1, color: colors.textPrimary, fontSize: 20, fontWeight: '600', padding: 0 }}
              value={value}
              onChangeText={setValue}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor={colors.textMuted}
              autoFocus
              selectTextOnFocus
              onSubmitEditing={handleSave}
            />
          </View>

          <View style={{ flexDirection: 'row', gap: 10, marginTop: spacing.xs }}>
            <Pressable
              style={{
                flex: 1,
                paddingVertical: 12,
                alignItems: 'center',
                borderRadius: br.lg,
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
                borderRadius: br.lg,
                backgroundColor: colors.primary,
              }}
              onPress={handleSave}
            >
              <Text variant="bodyLg" color={colors.primaryText} style={{ fontWeight: '700' }}>
                Hold
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
