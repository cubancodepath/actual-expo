import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../providers/ThemeProvider';
import { Text } from '../atoms/Text';

interface UnclearedPillProps {
  count: number;
  /** Filter label shown between count badge and "transaction(s)". Defaults to "uncleared". */
  label?: string;
  /** Visual style. "subtle" = muted card, "danger" = error colors. Defaults to "subtle". */
  variant?: 'subtle' | 'danger';
  onPress: () => void;
}

export function UnclearedPill({ count, label: filterLabel = 'uncleared', variant = 'subtle', onPress }: UnclearedPillProps) {
  const { colors, spacing, borderRadius: br } = useTheme();

  const label = count === 1 ? 'transaction' : 'transactions';

  const isDanger = variant === 'danger';
  const accent = colors.negative; // same red as negative amounts
  const bg = colors.cardBackground;
  const border = isDanger ? accent : colors.cardBorder;
  const textColor = isDanger ? accent : colors.textSecondary;
  const badgeBg = isDanger ? accent : colors.textMuted;
  const chevronColor = isDanger ? accent : colors.textMuted;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginHorizontal: spacing.lg,
        marginBottom: spacing.sm,
        paddingHorizontal: spacing.lg,
        paddingVertical: 11,
        borderRadius: br.full,
        backgroundColor: bg,
        borderWidth: 1,
        borderColor: border,
        minHeight: 44,
        opacity: pressed ? 0.72 : 1,
      })}
      accessibilityLabel={`Show ${count} ${filterLabel} ${label}. Tap to view.`}
      accessibilityRole="button"
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
        <Text variant="bodySm" color={textColor} style={{ fontWeight: '500' }}>
          Show
        </Text>
        <View
          style={{
            backgroundColor: badgeBg,
            borderRadius: 4,
            minWidth: 16,
            height: 16,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 3,
          }}
        >
          <Text
            variant="captionSm"
            color="#ffffff"
            style={{ fontWeight: '700', fontSize: 10, lineHeight: 13 }}
          >
            {count}
          </Text>
        </View>
        <Text variant="bodySm" color={textColor} style={{ fontWeight: '500' }}>
          {filterLabel} {label}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={14} color={chevronColor} style={{ opacity: 0.6 }} />
    </Pressable>
  );
}
