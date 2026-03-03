import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useThemedStyles } from '../../providers/ThemeProvider';
import { Text } from '../atoms/Text';
import type { Theme } from '../../../theme';

interface DetailRowProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  placeholder: string;
  onPress: () => void;
}

export function DetailRow({ icon, label, placeholder, onPress }: DetailRowProps) {
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);
  const hasValue = !!label;

  return (
    <Pressable style={styles.row} onPress={onPress}>
      <View style={styles.left}>
        <Ionicons name={icon} size={18} color={theme.colors.textMuted} />
        <Text
          variant="body"
          color={hasValue ? theme.colors.textPrimary : theme.colors.textMuted}
          style={styles.label}
        >
          {hasValue ? label : placeholder}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
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
