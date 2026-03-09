import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { useTheme } from '../../providers/ThemeProvider';
import { Text } from '..';

interface UpcomingSectionHeaderProps {
  count: number;
  expanded: boolean;
  onToggle: () => void;
}

export function UpcomingSectionHeader({
  count,
  expanded,
  onToggle,
}: UpcomingSectionHeaderProps) {
  const { colors, spacing } = useTheme();

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: withTiming(expanded ? '0deg' : '-90deg', { duration: 200 }) }],
  }));

  return (
    <Pressable
      onPress={onToggle}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: spacing.lg,
        paddingTop: spacing.sm,
        paddingBottom: spacing.sm,
        backgroundColor: colors.pageBackground,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Animated.View style={chevronStyle}>
        <Ionicons
          name="chevron-down"
          size={14}
          color={colors.textMuted}
          style={{ marginRight: spacing.xs }}
        />
      </Animated.View>
      <Text
        variant="captionSm"
        color={colors.textSecondary}
        style={{ textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: '700' }}
      >
        Upcoming
      </Text>
      <View
        style={{
          backgroundColor: colors.primarySubtle,
          borderRadius: 10,
          paddingHorizontal: spacing.sm,
          paddingVertical: 1,
          marginLeft: spacing.xs,
        }}
      >
        <Text variant="captionSm" color={colors.textSecondary} style={{ fontWeight: '600' }}>
          {count}
        </Text>
      </View>
    </Pressable>
  );
}
