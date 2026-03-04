import { View } from 'react-native';
import { useTheme, useThemedStyles } from '../../providers/ThemeProvider';
import { Card } from '../atoms/Card';
import { Text } from '../atoms/Text';
import { Divider } from '../atoms/Divider';
import { formatBalance } from '../../../lib/format';
import type { Theme } from '../../../theme';

interface SpendingOverviewCardProps {
  totalSpent: number;
  totalIncome: number;
  transactionCount: number;
}

export function SpendingOverviewCard({
  totalSpent,
  totalIncome,
  transactionCount,
}: SpendingOverviewCardProps) {
  const { colors, spacing, borderWidth: bw } = useTheme();
  const styles = useThemedStyles(createStyles);

  const spentAbs = Math.abs(totalSpent);
  const progress = totalIncome > 0
    ? Math.min(spentAbs / totalIncome, 1)
    : spentAbs > 0 ? 1 : 0;
  const isOverspent = spentAbs > totalIncome && totalIncome > 0;

  return (
    <Card style={styles.card}>
      {/* Hero zone */}
      <View style={styles.heroZone}>
        <Text variant="captionSm" color={colors.textMuted} style={styles.label}>
          Spent This Month
        </Text>
        <Text
          variant="displaySm"
          color={colors.negative}
          style={[styles.heroAmount, { marginTop: spacing.xs }]}
        >
          {formatBalance(totalSpent)}
        </Text>

        {/* Progress bar */}
        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressFill,
              {
                width: `${progress * 100}%`,
                backgroundColor: colors.negative,
                opacity: isOverspent ? 1 : 0.65,
              },
            ]}
          />
        </View>

        {totalIncome > 0 && (
          <Text
            variant="captionSm"
            color={isOverspent ? colors.negative : colors.textMuted}
            style={{ marginTop: spacing.xs }}
          >
            {isOverspent
              ? `${formatBalance(spentAbs - totalIncome)} over income`
              : `${formatBalance(totalIncome - spentAbs)} remaining`}
          </Text>
        )}
      </View>

      <Divider />

      {/* Three-column summary */}
      <View style={styles.summaryRow}>
        <View style={styles.summaryCol}>
          <Text variant="captionSm" color={colors.textMuted} style={styles.label}>
            Income
          </Text>
          <Text
            variant="bodyLg"
            color={colors.positive}
            style={styles.summaryValue}
          >
            {formatBalance(totalIncome)}
          </Text>
        </View>

        <View style={[styles.vertDivider, { backgroundColor: colors.divider, width: bw.thin }]} />

        <View style={styles.summaryCol}>
          <Text variant="captionSm" color={colors.textMuted} style={styles.label}>
            Spent
          </Text>
          <Text
            variant="bodyLg"
            color={colors.negative}
            style={styles.summaryValue}
          >
            {formatBalance(Math.abs(totalSpent))}
          </Text>
        </View>

        <View style={[styles.vertDivider, { backgroundColor: colors.divider, width: bw.thin }]} />

        <View style={styles.summaryCol}>
          <Text variant="captionSm" color={colors.textMuted} style={styles.label}>
            Transactions
          </Text>
          <Text
            variant="bodyLg"
            color={colors.textSecondary}
            style={styles.summaryValue}
          >
            {transactionCount.toString()}
          </Text>
        </View>
      </View>
    </Card>
  );
}

const createStyles = (theme: Theme) => ({
  card: {
    marginHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.lg,
    padding: 0,
    overflow: 'hidden' as const,
  },
  heroZone: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.lg,
    paddingBottom: theme.spacing.md,
  },
  label: {
    textTransform: 'uppercase' as const,
    letterSpacing: 0.8,
    fontWeight: '700' as const,
  },
  heroAmount: {
    fontVariant: ['tabular-nums'] as ('tabular-nums')[],
    fontWeight: '700' as const,
  },
  progressTrack: {
    height: 4,
    backgroundColor: theme.colors.divider,
    borderRadius: theme.borderRadius.full,
    marginTop: theme.spacing.sm,
    overflow: 'hidden' as const,
  },
  progressFill: {
    height: 4,
    borderRadius: theme.borderRadius.full,
  },
  summaryRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
  },
  summaryCol: {
    flex: 1,
    alignItems: 'center' as const,
  },
  summaryValue: {
    fontWeight: '700' as const,
    fontVariant: ['tabular-nums'] as ('tabular-nums')[],
    marginTop: 2,
  },
  vertDivider: {
    height: 28,
  },
});
