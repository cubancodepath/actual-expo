import { View, StyleSheet } from "react-native";
import { useTheme } from "../../providers/ThemeProvider";
import { Text } from "./Text";
import type { ThemeColors } from "../../../theme";

type BadgeVariant = "info" | "success" | "warning" | "error";

export interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
}

function getVariantColors(colors: ThemeColors, variant: BadgeVariant) {
  switch (variant) {
    case "info":
      return { bg: colors.primary, text: colors.primaryText };
    case "success":
      return { bg: colors.successBackground, text: colors.successText };
    case "warning":
      return { bg: colors.warningBackground, text: colors.warningText };
    case "error":
      return { bg: colors.errorBackground, text: colors.errorText };
  }
}

export function Badge({ label, variant = "info" }: BadgeProps) {
  const { colors, borderRadius } = useTheme();
  const v = getVariantColors(colors, variant);

  return (
    <View style={[styles.container, { backgroundColor: v.bg, borderRadius: borderRadius.full }]}>
      <Text variant="captionSm" color={v.text} style={{ fontWeight: "600" }}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    alignSelf: "flex-start",
  },
});
