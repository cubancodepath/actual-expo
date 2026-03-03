import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../providers/ThemeProvider';
import { Text } from '../atoms/Text';
import { formatBalance } from '../../../lib/format';

interface ReadyToAssignPillProps {
  amount: number; // cents
  onPress?: () => void;
}

export function ReadyToAssignPill({ amount, onPress }: ReadyToAssignPillProps) {
  const { colors, spacing, borderRadius: br } = useTheme();

  const pillBg = amount > 0
    ? colors.primary + '25'
    : amount < 0
      ? colors.negative + '25'
      : colors.cardBackground;

  const textColor = amount > 0
    ? colors.primary
    : amount < 0
      ? colors.negative
      : colors.textSecondary;

  const content = (
    <View
      style={{
        marginHorizontal: spacing.lg,
        marginTop: spacing.md,
        marginBottom: spacing.sm,
        backgroundColor: pillBg,
        borderRadius: br.full,
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.xl,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      <Text
        variant="headingLg"
        color={textColor}
        style={{ fontWeight: '700', fontVariant: ['tabular-nums'] }}
      >
        {formatBalance(amount)}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <Text variant="bodySm" color={textColor} style={{ fontWeight: '500' }}>
          Ready to Assign
        </Text>
        <Ionicons name="chevron-forward" size={16} color={textColor} />
      </View>
    </View>
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => pressed && { opacity: 0.8 }}>
        {content}
      </Pressable>
    );
  }

  return content;
}
