import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useThemedStyles } from '../../providers/ThemeProvider';
import { Text } from '../atoms/Text';
import { Amount } from '../atoms/Amount';
import type { Theme } from '../../../theme';

interface CategoryBreakdownRowProps {
  categoryName: string;
  total: number;      // cents, negative
  maxTotal: number;   // cents, the largest absolute total in the set
}

export function CategoryBreakdownRow({
  categoryName,
  total,
  maxTotal,
}: CategoryBreakdownRowProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);

  const absTotal = Math.abs(total);
  const absMax = Math.abs(maxTotal);
  const barPct = absMax > 0 ? absTotal / absMax : 0;

  return (
    <View style={styles.row}>
      <View style={[styles.iconWell, { backgroundColor: colors.primarySubtle }]}>
        <Ionicons name="pricetag-outline" size={14} color={colors.primary} />
      </View>

      <View style={styles.nameCol}>
        <Text variant="bodySm" numberOfLines={1} style={styles.name}>
          {categoryName}
        </Text>
        <View style={styles.barTrack}>
          <View
            style={[
              styles.barFill,
              { width: `${barPct * 100}%`, backgroundColor: colors.negativeSubtle },
            ]}
          />
        </View>
      </View>

      <Amount value={total} variant="bodySm" color={colors.negative} weight="600" />
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    gap: theme.spacing.md,
    minHeight: 44,
  },
  iconWell: {
    width: 28,
    height: 28,
    borderRadius: theme.borderRadius.sm,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  nameCol: {
    flex: 1,
    gap: 3,
  },
  name: {
    fontWeight: '600' as const,
  },
  barTrack: {
    height: 3,
    backgroundColor: theme.colors.divider,
    borderRadius: theme.borderRadius.full,
    overflow: 'hidden' as const,
  },
  barFill: {
    height: 3,
    borderRadius: theme.borderRadius.full,
  },
});
