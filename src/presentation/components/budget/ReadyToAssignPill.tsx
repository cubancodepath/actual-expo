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

  const isPositive = amount > 0;
  const isNegative = amount < 0;

  const bg = isPositive
    ? colors.primary + '20'
    : isNegative
      ? colors.negative + '20'
      : colors.cardBackground;

  const textColor = isPositive
    ? colors.primary
    : isNegative
      ? colors.negative
      : colors.textSecondary;

  const icon: keyof typeof Ionicons.glyphMap = isPositive
    ? 'sparkles'
    : isNegative
      ? 'warning'
      : 'checkmark-circle';

  const label = isPositive
    ? 'Ready to Assign'
    : isNegative
      ? 'Overassigned'
      : 'Fully Assigned';

  const content = (
    <View
      style={{
        marginHorizontal: spacing.lg,
        marginTop: spacing.md,
        marginBottom: spacing.sm,
        backgroundColor: bg,
        borderRadius: br.lg,
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.lg,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
      }}
    >
      <Ionicons name={icon} size={22} color={textColor} />
      <View style={{ flex: 1 }}>
        <Text
          variant="headingLg"
          color={textColor}
          style={{ fontWeight: '700', fontVariant: ['tabular-nums'] }}
        >
          {formatBalance(amount)}
        </Text>
        <Text variant="captionSm" color={textColor} style={{ opacity: 0.7, marginTop: 1 }}>
          {label}
        </Text>
      </View>
      {onPress && (isPositive || isNegative) && (
        <Ionicons name="chevron-forward" size={16} color={textColor} style={{ opacity: 0.5 }} />
      )}
    </View>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => pressed && { opacity: 0.8 }}
        accessibilityLabel={`${formatBalance(amount)} ${label}. Tap to assign budget.`}
        accessibilityRole="button"
      >
        {content}
      </Pressable>
    );
  }

  return content;
}
