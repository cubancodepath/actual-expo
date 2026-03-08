import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useThemedStyles } from '../../providers/ThemeProvider';
import { Text } from '../atoms/Text';
import { Amount } from '../atoms/Amount';
import type { Theme } from '../../../theme';

function formatReconciled(timestamp: string): string {
  const date = new Date(Number(timestamp));
  const now = new Date();
  const isThisYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(isThisYear ? {} : { year: 'numeric' }),
  });
}

interface BalanceSummaryProps {
  balance: number;
  clearedBalance: number;
  lastReconciled?: string | null;
}

export function BalanceSummary({ balance, clearedBalance, lastReconciled }: BalanceSummaryProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);

  const unclearedBalance = balance - clearedBalance;
  const hasBreakdown = balance !== clearedBalance;

  return (
    <View style={styles.container}>
      {/* Large title balance */}
      <Amount
        value={balance}
        variant="displayLg"
        colored={false}
        color={balance < 0 ? colors.negative : colors.textPrimary}
        weight="700"
      />

      {/* Cleared / Uncleared subtitle */}
      {hasBreakdown && (
        <View style={styles.subtitleRow}>
          <Text variant="bodySm" color={colors.textMuted}>Cleared </Text>
          <Amount value={clearedBalance} variant="bodySm" color={colors.textMuted} weight="600" />
          <Text variant="bodySm" color={colors.textMuted}>{'  ·  '}</Text>
          <Text variant="bodySm" color={colors.textMuted}>Uncleared </Text>
          <Amount value={unclearedBalance} variant="bodySm" color={colors.textMuted} weight="600" />
        </View>
      )}

      {/* Last reconciled */}
      {lastReconciled && (
        <View style={styles.reconciledRow}>
          <Ionicons name="lock-closed" size={11} color={colors.textMuted} />
          <Text variant="captionSm" color={colors.textMuted}>
            Reconciled {formatReconciled(lastReconciled)}
          </Text>
        </View>
      )}
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  container: {
    alignItems: 'center' as const,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.lg,
  },
  subtitleRow: {
    flexDirection: 'row' as const,
    alignItems: 'baseline' as const,
    marginTop: theme.spacing.xxs,
  },
  reconciledRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
    marginTop: theme.spacing.xxs,
  },
});
