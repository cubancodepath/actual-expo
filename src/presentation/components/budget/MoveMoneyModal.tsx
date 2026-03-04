import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../providers/ThemeProvider';
import { Text } from '../atoms/Text';
import { Amount } from '../atoms/Amount';

export type MoveMoneyMode = 'transfer' | 'cover';

export type MoveMoneyCategory = {
  id: string;
  name: string;
  balance: number;
  groupName: string;
};

interface MoveMoneyModalProps {
  visible: boolean;
  mode: MoveMoneyMode;
  sourceName: string;
  prefilledAmount: number;
  candidates: MoveMoneyCategory[];
  onClose: () => void;
  onConfirm: (otherCategoryId: string, amountCents: number) => void;
}

export function MoveMoneyModal({
  visible,
  mode,
  sourceName,
  prefilledAmount,
  candidates,
  onClose,
  onConfirm,
}: MoveMoneyModalProps) {
  const { colors, spacing, borderRadius: br, borderWidth: bw } = useTheme();
  const [amountStr, setAmountStr] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setAmountStr((Math.abs(prefilledAmount) / 100).toFixed(2));
      setSelectedId(null);
    }
  }, [visible, prefilledAmount]);

  function handleConfirm() {
    if (!selectedId) return;
    const cents = Math.round(parseFloat(amountStr.replace(/[^0-9.]/g, '')) * 100);
    if (!cents || cents <= 0) return;
    onConfirm(selectedId, cents);
  }

  const isTransfer = mode === 'transfer';
  const title = isTransfer ? `Transfer from ${sourceName}` : `Cover ${sourceName}`;
  const pickLabel = isTransfer ? 'To category' : 'From category';
  const confirmLabel = isTransfer ? 'Transfer' : 'Cover';

  const labelStyle = {
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
    fontWeight: '700' as const,
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.pageBackground }}>
        {/* Header */}
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: spacing.lg,
            borderBottomWidth: bw.thin,
            borderBottomColor: colors.divider,
          }}
        >
          <Text variant="headingSm" style={{ flexShrink: 1 }}>{title}</Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <Text variant="bodyLg" color={colors.link}>Cancel</Text>
          </Pressable>
        </View>

        {/* Amount */}
        <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.sm }}>
          <Text variant="captionSm" color={colors.textMuted} style={{ ...labelStyle, marginBottom: 6 }}>
            Amount
          </Text>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              backgroundColor: colors.cardBackground,
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
              value={amountStr}
              onChangeText={setAmountStr}
              keyboardType="decimal-pad"
              selectTextOnFocus
              autoFocus
            />
          </View>
        </View>

        {/* Category picker */}
        <Text
          variant="captionSm"
          color={colors.textMuted}
          style={{ ...labelStyle, paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: 6 }}
        >
          {pickLabel}
        </Text>
        <ScrollView style={{ flex: 1, marginTop: 4 }} keyboardShouldPersistTaps="handled">
          {candidates.map((cat) => {
            const selected = selectedId === cat.id;
            return (
              <Pressable
                key={cat.id}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingHorizontal: spacing.lg,
                  paddingVertical: 14,
                  borderBottomWidth: bw.thin,
                  borderBottomColor: colors.divider,
                  backgroundColor: selected ? colors.cardBackground : undefined,
                }}
                onPress={() => setSelectedId(cat.id)}
              >
                <View style={{ flex: 1, marginRight: 12 }}>
                  <Text
                    variant="captionSm"
                    color={colors.textMuted}
                    style={{ textTransform: 'uppercase', letterSpacing: 0.4 }}
                  >
                    {cat.groupName}
                  </Text>
                  <Text variant="bodyLg" style={{ marginTop: 1 }}>{cat.name}</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Amount value={cat.balance} variant="body" weight="600" />
                  {selected && <Ionicons name="checkmark" size={18} color={colors.positive} />}
                </View>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Confirm */}
        <Pressable
          style={{
            margin: spacing.lg,
            backgroundColor: (!selectedId || !amountStr) ? colors.cardBackground : colors.link,
            borderRadius: br.lg,
            paddingVertical: spacing.lg,
            alignItems: 'center',
            borderWidth: (!selectedId || !amountStr) ? bw.thin : 0,
            borderColor: colors.cardBorder,
          }}
          onPress={handleConfirm}
          disabled={!selectedId || !amountStr}
        >
          <Text variant="bodyLg" color={colors.primaryText} style={{ fontWeight: '700' }}>
            {confirmLabel}
          </Text>
        </Pressable>
      </View>
    </Modal>
  );
}
