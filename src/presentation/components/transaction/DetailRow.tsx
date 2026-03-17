import { Pressable, View } from "react-native";
import { Icon } from "../atoms/Icon";
import type { IconName } from "../atoms/iconRegistry";
import { useTheme, useThemedStyles } from "../../providers/ThemeProvider";
import { Text } from "../atoms/Text";
import type { Theme } from "../../../theme";

interface DetailRowProps {
  icon: IconName;
  label: string;
  placeholder: string;
  onPress: () => void;
  onClear?: () => void;
}

export function DetailRow({ icon, label, placeholder, onPress, onClear }: DetailRowProps) {
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);
  const hasValue = !!label;

  return (
    <Pressable style={styles.row} onPress={onPress}>
      <View style={styles.left}>
        <Icon name={icon} size={18} color={theme.colors.textMuted} />
        <Text
          variant="body"
          color={hasValue ? theme.colors.textPrimary : theme.colors.textMuted}
          style={styles.label}
          numberOfLines={1}
        >
          {hasValue ? label : placeholder}
        </Text>
      </View>
      {hasValue && onClear ? (
        <Pressable onPress={onClear} hitSlop={8}>
          <Icon name="closeCircle" size={18} color={theme.colors.textMuted} />
        </Pressable>
      ) : (
        <Icon name="chevronForward" size={18} color={theme.colors.textMuted} />
      )}
    </Pressable>
  );
}

const createStyles = (theme: Theme) => ({
  row: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    minHeight: 44,
  },
  left: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    flex: 1,
  },
  label: {
    marginLeft: theme.spacing.sm,
  },
});
