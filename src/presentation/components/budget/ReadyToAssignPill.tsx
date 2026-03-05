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

/**
 * Background fill opacities per state and color scheme.
 *
 * Purple has lower perceptual brightness than red, so it needs a slightly
 * higher fill to read clearly. The resolved/green state intentionally uses
 * the lowest fill — it should be visible but not draw the eye.
 *
 * Values chosen so the tinted fill clears the pageBackground (navy50 in light,
 * gray900 in dark) with enough contrast to be seen without alarming the user.
 */
const FILL_OPACITY = {
  positive: { light: 0.12, dark: 0.18 },  // amber: Ready to Assign
  negative: { light: 0.11, dark: 0.17 },  // red: Overassigned
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

  // -- Semantic color for the current state --
  // Positive (money to assign): warning/amber — communicates "pending action"
  // without the celebration tone of green or the brand tone of purple.
  // Negative (overassigned): red — clear error state.
  // In light mode, use darker variants for small-text WCAG AA compliance.
  const textColor = isPositive
    ? isDark
      ? colors.warning         // orange300 in dark
      : '#79400a'              // palette.orange700 — passes 4.5:1 on light surface
    : isDark
      ? colors.negative        // red400 in dark
      : '#ab091e';             // palette.red700 — passes 4.5:1 on light surface

  const fillOpacityKey = isPositive ? 'positive' : 'negative';
  const fillOpacity = isDark
    ? FILL_OPACITY[fillOpacityKey].dark
    : FILL_OPACITY[fillOpacityKey].light;

  const backgroundColor = withOpacity(textColor, fillOpacity);

  // -- Icons --
  // `alert-circle-outline` for overassigned: reads as "attention needed" at small
  // sizes without the visual weight of the solid warning triangle.
  // `wallet-outline` for ready: communicates "money available" more directly
  // than `sparkles` in a finance context.
  // `checkmark-circle-outline` for resolved: outline reduces emphasis vs filled,
  // matching the lower-priority nature of this state.
  const icon: keyof typeof Ionicons.glyphMap = isPositive
    ? 'wallet-outline'
    : 'alert-circle-outline';

  const label = isPositive ? 'Ready to Assign' : 'Overassigned';

  const accessibilityLabel = `${formatPrivacyAware(amount)} ${label}. Tap to assign budget.`;

  // -- Layout --
  const pillStyle = {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    alignSelf: 'center' as const,
    backgroundColor,
    // Horizontal padding: spacing.lg (16pt) gives comfortable breathing room
    // around the text at the widths this pill can reach.
    paddingHorizontal: spacing.lg,
    // Vertical padding: 11pt gives a total height of ~40pt (18pt captionSm
    // lineHeight + 22pt padding). The Pressable wrapper sets minHeight: 44
    // to absorb the 4pt gap and meet the HIG touch target requirement without
    // visually inflating the pill.
    paddingVertical: 11,
    borderRadius: br.full,
    gap: spacing.xs,  // 4pt — tight gap between icon, amount, and label
  };

  const content = (
    <View style={pillStyle}>
      <Ionicons name={icon} size={15} color={textColor} />
      <Amount value={amount} variant="bodySm" color={textColor} weight="700" />
      {/* Label is secondary context — slightly lower visual weight than the amount */}
      <Text variant="captionSm" color={textColor} style={{ fontWeight: '500' }}>
        {label}
      </Text>
      {/* Chevron only when interactive — signals tappability */}
      {onPress && (
        <Ionicons
          name="chevron-forward"
          size={12}
          color={textColor}
          style={{ opacity: 0.45, marginLeft: 0 }}
        />
      )}
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
