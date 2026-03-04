import { View } from 'react-native';
import { useTheme } from '../../providers/ThemeProvider';
import { Text } from '../atoms/Text';
import { Amount } from '../atoms/Amount';

interface BudgetSummaryBarProps {
  income: number;
  budgeted: number;
  spent: number;
}

export function BudgetSummaryBar({ income, budgeted, spent }: BudgetSummaryBarProps) {
  const { colors, spacing, borderWidth: bw } = useTheme();

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.cardBackground,
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.lg,
        borderBottomWidth: bw.thin,
        borderBottomColor: colors.divider,
      }}
    >
      <View style={{ flex: 1, alignItems: 'center' }}>
        <Text
          variant="captionSm"
          color={colors.textMuted}
          style={{ textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: '700', marginBottom: 2 }}
        >
          Income
        </Text>
        <Amount value={income} variant="bodyLg" color={colors.positive} weight="700" />
      </View>
      <View style={{ width: 1, height: 28, backgroundColor: colors.divider }} />
      <View style={{ flex: 1, alignItems: 'center' }}>
        <Text
          variant="captionSm"
          color={colors.textMuted}
          style={{ textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: '700', marginBottom: 2 }}
        >
          Budgeted
        </Text>
        <Amount value={budgeted} variant="bodyLg" colored={false} weight="700" />
      </View>
      <View style={{ width: 1, height: 28, backgroundColor: colors.divider }} />
      <View style={{ flex: 1, alignItems: 'center' }}>
        <Text
          variant="captionSm"
          color={colors.textMuted}
          style={{ textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: '700', marginBottom: 2 }}
        >
          Spent
        </Text>
        <Amount value={spent} variant="bodyLg" color={colors.textSecondary} weight="700" />
      </View>
    </View>
  );
}
