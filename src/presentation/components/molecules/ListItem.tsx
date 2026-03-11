import { Pressable, View, StyleSheet, type ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../providers/ThemeProvider";
import { Text } from "../atoms/Text";
import { RowSeparator } from "../atoms/RowSeparator";
import type { ReactNode } from "react";

export interface ListItemProps {
  title: string;
  titleColor?: string;
  subtitle?: string;
  left?: ReactNode;
  right?: ReactNode;
  onPress?: () => void;
  showChevron?: boolean;
  /** Show a checkmark on the right side */
  checkmark?: boolean;
  /** Show an inset separator at the bottom of this item */
  showSeparator?: boolean;
  /** Left inset for the separator (defaults to RowSeparator default = spacing.lg) */
  separatorInsetLeft?: number;
  style?: ViewStyle;
}

export function ListItem({
  title,
  titleColor,
  subtitle,
  left,
  right,
  onPress,
  showChevron = false,
  checkmark = false,
  showSeparator = false,
  separatorInsetLeft,
  style,
}: ListItemProps) {
  const { colors, spacing } = useTheme();

  const content = (
    <View style={[styles.container, { paddingVertical: spacing.md, paddingHorizontal: spacing.lg }, style]}>
      {left && <View style={[styles.left, { marginRight: spacing.md }]}>{left}</View>}

      <View style={styles.content}>
        <Text variant="bodyLg" color={titleColor}>{title}</Text>
        {subtitle && (
          <Text variant="bodySm" color={colors.textSecondary}>
            {subtitle}
          </Text>
        )}
      </View>

      {right && <View style={styles.right}>{right}</View>}

      {checkmark && (
        <Ionicons
          name="checkmark"
          size={20}
          color={colors.primary}
          style={{ marginLeft: spacing.sm }}
        />
      )}

      {showChevron && (
        <Ionicons
          name="chevron-forward"
          size={18}
          color={colors.textMuted}
          style={{ marginLeft: spacing.sm }}
        />
      )}

      {showSeparator && <RowSeparator insetLeft={separatorInsetLeft} />}
    </View>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => pressed && { opacity: 0.7 }}
      >
        {content}
      </Pressable>
    );
  }

  return content;
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
  },
  left: {
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    flex: 1,
  },
  right: {
    flexShrink: 0,
    alignItems: "flex-end",
    justifyContent: "center",
  },
});
