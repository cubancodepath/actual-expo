import { View, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../providers/ThemeProvider";
import { Text } from "../atoms/Text";
import type { ThemeColors } from "../../../theme";

type BannerVariant = "info" | "success" | "warning" | "error";

export interface BannerProps {
  message: string;
  variant?: BannerVariant;
  onDismiss?: () => void;
  onPress?: () => void;
}

function getVariantStyles(colors: ThemeColors, variant: BannerVariant) {
  switch (variant) {
    case "info":
      return { bg: colors.primary + "18", text: colors.primary, icon: "information-circle" as const };
    case "success":
      return { bg: colors.successBackground, text: colors.successText, icon: "checkmark-circle" as const };
    case "warning":
      return { bg: colors.warningBackground, text: colors.warningText, icon: "warning" as const };
    case "error":
      return { bg: colors.errorBackground, text: colors.errorText, icon: "alert-circle" as const };
  }
}

export function Banner({
  message,
  variant = "info",
  onDismiss,
  onPress,
}: BannerProps) {
  const { colors, spacing, borderRadius: br } = useTheme();
  const v = getVariantStyles(colors, variant);

  const content = (
    <View
      style={[
        styles.container,
        {
          backgroundColor: v.bg,
          borderRadius: br.md,
          padding: spacing.md,
          marginHorizontal: spacing.lg,
          marginVertical: spacing.xs,
        },
      ]}
    >
      <Ionicons name={v.icon} size={20} color={v.text} style={{ marginRight: spacing.sm }} />
      <Text variant="bodySm" color={v.text} style={styles.message}>
        {message}
      </Text>
      {onDismiss && (
        <Pressable onPress={onDismiss} hitSlop={8}>
          <Ionicons name="close" size={18} color={v.text} />
        </Pressable>
      )}
    </View>
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => pressed && { opacity: 0.8 }}>
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
  message: {
    flex: 1,
  },
});
