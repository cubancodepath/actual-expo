import { View, StyleSheet, type ViewStyle } from "react-native";
import { useTheme } from "../../providers/ThemeProvider";
import { Text } from "../atoms/Text";
import type { ReactNode } from "react";

export interface SectionHeaderProps {
  title: string;
  right?: ReactNode;
  style?: ViewStyle;
}

export function SectionHeader({ title, right, style }: SectionHeaderProps) {
  const { colors, spacing } = useTheme();

  return (
    <View
      style={[
        styles.container,
        { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
        style,
      ]}
    >
      <Text
        variant="caption"
        color={colors.textMuted}
        style={{ textTransform: "uppercase", letterSpacing: 0.8 }}
      >
        {title}
      </Text>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
});
