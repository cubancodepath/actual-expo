import { View } from 'react-native';
import { useTheme, useThemedStyles } from '../../providers/ThemeProvider';
import { Card } from '../atoms/Card';
import { Text } from '../atoms/Text';
import { Amount } from '../atoms/Amount';
import { Divider } from '../atoms/Divider';
import { formatBalance } from '../../../lib/format';
import type { Theme } from '../../../theme';

interface BalanceSummaryProps {
  balance: number;
  clearedBalance: number;
}

export function BalanceSummary({ balance, clearedBalance }: BalanceSummaryProps) {
  const { colors, borderWidth: bw } = useTheme();
  const styles = useThemedStyles(createStyles);

  const unclearedBalance = balance - clearedBalance;
  const hasBreakdown = balance !== clearedBalance;

  return (
    <Card style={styles.card}>
      {/* Hero balance */}
      <View style={styles.heroZone}>
        <Amount value={balance} variant="headingLg" colored />
        <Text variant="caption" color={colors.textMuted} style={styles.heroLabel}>
          Current Balance
        </Text>
      </View>

      {/* Cleared / Uncleared breakdown */}
      {hasBreakdown && (
        <>
          <Divider />
          <View style={styles.summaryRow}>
            <View style={styles.summaryCol}>
              <Text variant="captionSm" color={colors.textMuted} style={styles.label}>
                Cleared
              </Text>
              <Text
                variant="bodyLg"
                color={colors.positive}
                style={styles.summaryValue}
              >
                {formatBalance(clearedBalance)}
              </Text>
            </View>

            <View style={[styles.vertDivider, { backgroundColor: colors.divider, width: bw.thin }]} />

            <View style={styles.summaryCol}>
              <Text variant="captionSm" color={colors.textMuted} style={styles.label}>
                Uncleared
              </Text>
              <Text
                variant="bodyLg"
                color={colors.textSecondary}
                style={styles.summaryValue}
              >
                {formatBalance(unclearedBalance)}
              </Text>
            </View>
          </View>
        </>
      )}
    </Card>
  );
}

const createStyles = (theme: Theme) => ({
  card: {
    marginHorizontal: theme.spacing.lg,
    marginTop: theme.spacing.lg,
    marginBottom: theme.spacing.sm,
    padding: 0,
    overflow: 'hidden' as const,
  },
  heroZone: {
    alignItems: 'center' as const,
    paddingVertical: theme.spacing.lg,
    paddingHorizontal: theme.spacing.lg,
  },
  heroLabel: {
    marginTop: theme.spacing.xxs,
  },
  label: {
    textTransform: 'uppercase' as const,
    letterSpacing: 0.8,
    fontWeight: '700' as const,
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
