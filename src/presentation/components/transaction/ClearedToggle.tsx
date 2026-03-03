import { Switch, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useThemedStyles } from '../../providers/ThemeProvider';
import { Text } from '../atoms/Text';
import type { Theme } from '../../../theme';

interface ClearedToggleProps {
  value: boolean;
  onValueChange: (value: boolean) => void;
}

export function ClearedToggle({ value, onValueChange }: ClearedToggleProps) {
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);

  return (
    <View style={styles.row}>
      <View style={styles.left}>
        <Ionicons name="checkmark-circle-outline" size={18} color={theme.colors.textMuted} />
        <Text variant="body" color={theme.colors.textPrimary} style={styles.label}>
          Cleared
        </Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: theme.colors.inputBorder, true: theme.colors.primary }}
        thumbColor={theme.colors.cardBackground}
        ios_backgroundColor={theme.colors.inputBorder}
      />
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
  },
  left: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    flex: 1,
  },
  label: {
    marginLeft: theme.spacing.sm,
  },
});
