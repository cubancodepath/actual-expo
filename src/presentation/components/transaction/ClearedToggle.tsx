import { Pressable, Switch, View } from 'react-native';
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
    <Pressable style={styles.row} onPress={() => onValueChange(!value)}>
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
    </Pressable>
  );
}

const createStyles = (theme: Theme) => ({
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    minHeight: 44,
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
