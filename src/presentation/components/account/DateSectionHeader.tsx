import { View } from 'react-native';
import { useTheme } from '../../providers/ThemeProvider';
import { Text } from '..';
import { formatDateLong } from '../../../lib/date';

interface DateSectionHeaderProps {
  date: number;
}

export function DateSectionHeader({ date }: DateSectionHeaderProps) {
  const { colors, spacing } = useTheme();

  return (
    <View
      style={{
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.sm,
        backgroundColor: colors.pageBackground,
      }}
    >
      <Text
        variant="caption"
        color={colors.textMuted}
        style={{ textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: '600' }}
      >
        {formatDateLong(date)}
      </Text>
    </View>
  );
}
