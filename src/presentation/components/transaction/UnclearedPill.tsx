import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../providers/ThemeProvider';
import { Text } from '../atoms/Text';

interface UnclearedPillProps {
  count: number;
  onPress: () => void;
}

export function UnclearedPill({ count, onPress }: UnclearedPillProps) {
  const { colors, spacing, borderRadius: br } = useTheme();

  const label = count === 1 ? 'transaction' : 'transactions';

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
        backgroundColor: colors.cardBackground,
        borderWidth: 1,
        borderColor: colors.cardBorder,
        minHeight: 44,
        opacity: pressed ? 0.72 : 1,
      })}
      accessibilityLabel={`Show ${count} uncleared ${label}. Tap to view.`}
      accessibilityRole="button"
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
        <Text variant="bodySm" color={colors.textSecondary} style={{ fontWeight: '500' }}>
          Show
        </Text>
        <View
          style={{
            backgroundColor: colors.textMuted,
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
        <Text variant="bodySm" color={colors.textSecondary} style={{ fontWeight: '500' }}>
          uncleared {label}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={14} color={colors.textMuted} style={{ opacity: 0.6 }} />
    </Pressable>
  );
}
