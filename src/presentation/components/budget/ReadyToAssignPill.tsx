import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../providers/ThemeProvider';
import { useColorScheme } from 'react-native';
import { Text } from '../atoms/Text';
import { Amount } from '../atoms/Amount';
import { withOpacity } from '../../../lib/colors';
import { formatPrivacyAware } from '../../../lib/format';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ReadyToAssignPillProps {
  /** Budget balance in cents. Positive = money available, negative = overassigned. */
  amount: number;
  /** When provided, the pill becomes tappable (not rendered for the zero/resolved state). */
  onPress?: () => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FILL_OPACITY = {
  positive: { light: 0.12, dark: 0.18 },
  negative: { light: 0.11, dark: 0.17 },
} as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ReadyToAssignPill({ amount, onPress }: ReadyToAssignPillProps) {
  const { colors, spacing, borderRadius: br } = useTheme();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const isPositive = amount > 0;
  const isNegative = amount < 0;

  const textColor = isPositive
    ? isDark
      ? colors.warning
      : '#79400a'
    : isDark
      ? colors.negative
      : '#ab091e';

  const fillOpacityKey = isPositive ? 'positive' : 'negative';
  const fillOpacity = isDark
    ? FILL_OPACITY[fillOpacityKey].dark
    : FILL_OPACITY[fillOpacityKey].light;

  const backgroundColor = withOpacity(textColor, fillOpacity);

  const icon: keyof typeof Ionicons.glyphMap = isPositive
    ? 'wallet-outline'
    : 'alert-circle-outline';

  const label = isPositive ? 'Ready to Assign' : 'Overassigned';

  const accessibilityLabel = `${formatPrivacyAware(amount)} ${label}. Tap to assign budget.`;

  const pillStyle = {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    backgroundColor,
    marginHorizontal: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: 11,
    borderRadius: br.full,
  };

  const content = (
    <View style={pillStyle}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
        <Ionicons name={icon} size={15} color={textColor} />
        <Amount value={amount} variant="bodySm" color={textColor} weight="700" />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
        <Text variant="captionSm" color={textColor} style={{ fontWeight: '500' }}>
          {label}
        </Text>
        {onPress && (
          <Ionicons
            name="chevron-forward"
            size={12}
            color={textColor}
            style={{ opacity: 0.45 }}
          />
        )}
      </View>
    </View>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          { minHeight: 44, justifyContent: 'center' },
          pressed && { opacity: 0.72 },
        ]}
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
      >
        {content}
      </Pressable>
    );
  }

  return (
    <View accessibilityLabel={accessibilityLabel}>
      {content}
    </View>
  );
}
