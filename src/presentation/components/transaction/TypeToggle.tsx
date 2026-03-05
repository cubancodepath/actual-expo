import { Pressable, View } from 'react-native';
import { useTheme, useThemedStyles } from '../../providers/ThemeProvider';
import { Text } from '../atoms/Text';
import type { Theme } from '../../../theme';

export type TransactionType = 'expense' | 'income';

interface TypeToggleProps {
  type: TransactionType;
  onChangeType: (type: TransactionType) => void;
}

export function TypeToggle({ type, onChangeType }: TypeToggleProps) {
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);

  return (
    <View style={styles.row}>
      <Pressable
        style={[
          styles.btn,
          type === 'expense' && { backgroundColor: theme.colors.negative },
        ]}
        onPress={() => onChangeType('expense')}
      >
        <Text
          variant="caption"
          color={type === 'expense' ? theme.colors.primaryText : theme.colors.textSecondary}
          style={styles.btnText}
        >
          Expense
        </Text>
      </Pressable>
      <Pressable
        style={[
          styles.btn,
          type === 'income' && { backgroundColor: theme.colors.positive },
        ]}
        onPress={() => onChangeType('income')}
      >
        <Text
          variant="caption"
          color={type === 'income' ? theme.colors.primaryText : theme.colors.textSecondary}
          style={styles.btnText}
        >
          Income
        </Text>
      </Pressable>
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  row: {
    flexDirection: 'row' as const,
    backgroundColor: theme.colors.cardBackground,
    borderRadius: theme.borderRadius.lg,
    padding: 4,
    borderWidth: theme.borderWidth.default,
    borderColor: theme.colors.cardBorder,
  },
  btn: {
    flex: 1,
    minHeight: 44,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    borderRadius: theme.borderRadius.md,
  },
  btnText: {
    fontWeight: '600' as const,
  },
});
