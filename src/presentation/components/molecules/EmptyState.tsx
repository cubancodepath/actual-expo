import { Pressable, View, StyleSheet } from "react-native";
import { Icon } from "../atoms/Icon";
import type { IconName } from "../atoms/iconRegistry";
import { useTheme } from "../../providers/ThemeProvider";
import { Text } from "../atoms/Text";

export interface EmptyStateProps {
  icon?: IconName;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({
  icon = "folderOpenOutline",
  title,
  description,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  const { colors, spacing } = useTheme();

  return (
    <View style={styles.container}>
      <Icon name={icon} size={48} color={colors.textMuted} />
      <Text variant="headingSm" color={colors.textSecondary} style={{ marginTop: spacing.lg }}>
        {title}
      </Text>
      {description && (
        <Text
          variant="bodySm"
          color={colors.textMuted}
          align="center"
          style={{ marginTop: spacing.xs, maxWidth: 260 }}
        >
          {description}
        </Text>
      )}
      {actionLabel && onAction && (
        <Pressable
          onPress={onAction}
          style={({ pressed }) => [
            { marginTop: spacing.md, paddingVertical: spacing.xs, paddingHorizontal: spacing.lg },
            pressed && { opacity: 0.6 },
          ]}
        >
          <Text variant="bodySm" color={colors.primary} style={{ fontWeight: "600" }}>
            {actionLabel}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 64,
  },
});
