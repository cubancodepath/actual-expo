import { View } from 'react-native';
import { useTheme, useThemedStyles } from '../../providers/ThemeProvider';
import { Text } from '../atoms/Text';
import { Amount } from '../atoms/Amount';
import type { Theme } from '../../../theme';

interface BalanceSummaryProps {
  balance: number;
  clearedBalance: number;
}

export function BalanceSummary({ balance, clearedBalance }: BalanceSummaryProps) {
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
});
