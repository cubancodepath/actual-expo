import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../providers/ThemeProvider';
import { Text } from '../atoms/Text';
import { formatBalance } from '../../../lib/format';

interface HoldBarProps {
  buffered: number;
  toBudget: number;
  onHold: () => void;
  onReset: () => void;
}

export function HoldBar({ buffered, toBudget, onHold, onReset }: HoldBarProps) {
  const { colors, spacing, borderWidth: bw, borderRadius: br } = useTheme();

  if (buffered === 0 && toBudget <= 0) return null;

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: colors.cardBackground,
        borderBottomWidth: bw.thin,
        borderBottomColor: colors.divider,
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.md,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
        <Ionicons name="arrow-forward" size={16} color={colors.primary} />
        <View>
          <Text variant="bodySm" color={colors.link} style={{ fontWeight: '600' }}>
            Held for Next Month
          </Text>
          {buffered > 0 && (
            <Text variant="body" color={colors.primary} style={{ fontWeight: '700', marginTop: 1 }}>
              {formatBalance(buffered)}
            </Text>
          )}
        </View>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {buffered > 0 && (
          <Pressable
            style={{
              paddingHorizontal: 10,
              paddingVertical: 5,
              borderRadius: br.sm,
              borderWidth: bw.thin,
              borderColor: colors.divider,
            }}
            onPress={onReset}
            hitSlop={8}
          >
            <Text variant="caption" color={colors.textSecondary} style={{ fontWeight: '600' }}>
              Reset
            </Text>
          </Pressable>
        )}
        <Pressable
          style={{
            paddingHorizontal: 12,
            paddingVertical: 5,
            backgroundColor: colors.primary,
            borderRadius: br.sm,
          }}
          onPress={onHold}
          hitSlop={8}
        >
          <Text variant="caption" color={colors.primaryText} style={{ fontWeight: '700' }}>
            {buffered > 0 ? 'Edit' : 'Hold'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
