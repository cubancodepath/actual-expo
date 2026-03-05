import { Pressable, View } from 'react-native';
import { useTheme } from '../../providers/ThemeProvider';
import { useColorScheme } from 'react-native';
import { Text } from '../atoms/Text';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OverspentPillProps {
  /** Number of overspent categories. */
  count: number;
  /** Called when the pill is tapped. */
  onPress: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function OverspentPill({ count, onPress }: OverspentPillProps) {
  const { colors, spacing, borderRadius: br } = useTheme();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  // Subtle muted background — secondary surface, not alarming.
  const bgColor = isDark ? colors.buttonSecondaryBackground : colors.cardBackground;
  const borderColor = isDark ? colors.divider : colors.cardBorder;
  const labelColor = colors.textSecondary;

  // Muted red badge — softer than the overassigned pill red.
  const badgeBg = isDark ? '#8a041a' : '#ab091e';
  const badgeText = '#ffffff';

  // Cover button — solid secondary style for clear legibility.
  const coverBg = isDark ? colors.primary : colors.primary;
  const coverText = '#ffffff';

  const label = count === 1 ? 'category overspent' : 'categories overspent';
  const accessibilityLabel = `${count} ${label}. Tap to cover.`;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        {
          flexDirection: 'row' as const,
          alignItems: 'center' as const,
          justifyContent: 'space-between' as const,
          minHeight: 44,
          marginHorizontal: spacing.lg,
          paddingHorizontal: spacing.md,
          paddingVertical: 8,
          borderRadius: br.full,
          backgroundColor: bgColor,
          borderWidth: 1,
          borderColor,
        },
        pressed && { opacity: 0.72 },
      ]}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
    >
      {/* Left: red badge + label */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <View
          style={{
            backgroundColor: badgeBg,
            borderRadius: 100,
            minWidth: 18,
            height: 18,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 4,
          }}
        >
          <Text
            variant="captionSm"
            color={badgeText}
            style={{ fontWeight: '700', fontSize: 10, lineHeight: 14 }}
          >
            {count}
          </Text>
        </View>
        <Text variant="captionSm" color={labelColor} style={{ fontWeight: '500' }}>
          {label}
        </Text>
      </View>

      {/* Right: Cover pill button */}
      <View
        style={{
          backgroundColor: coverBg,
          borderRadius: br.full,
          paddingHorizontal: 14,
          paddingVertical: 5,
        }}
      >
        <Text variant="captionSm" color={coverText} style={{ fontWeight: '600' }}>
          Cover
        </Text>
      </View>
    </Pressable>
  );
}
