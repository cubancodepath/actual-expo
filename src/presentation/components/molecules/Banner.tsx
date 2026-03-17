import { View, Pressable, StyleSheet } from "react-native";
import { Icon } from "../atoms/Icon";
import type { IconName } from "../atoms/iconRegistry";
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
      return {
        bg: colors.primarySubtle,
        text: colors.primary,
        icon: "informationCircle" as const satisfies IconName,
      };
    case "success":
      return {
        bg: colors.successBackground,
        text: colors.successText,
        icon: "checkmarkCircle" as const satisfies IconName,
      };
    case "warning":
      return {
        bg: colors.warningBackground,
        text: colors.warningText,
        icon: "warning" as const satisfies IconName,
      };
    case "error":
      return {
        bg: colors.errorBackground,
        text: colors.errorText,
        icon: "alertCircle" as const satisfies IconName,
      };
  }
}

export function Banner({ message, variant = "info", onDismiss, onPress }: BannerProps) {
  const { colors, spacing, borderRadius: br } = useTheme();
  const v = getVariantStyles(colors, variant);
  const isError = variant === "error";

  const content = (
    <View
      style={[
        styles.container,
        {
          backgroundColor: v.bg,
          borderRadius: br.lg,
          paddingVertical: spacing.md,
          paddingHorizontal: spacing.lg,
          marginHorizontal: spacing.lg,
          marginVertical: spacing.xs,
        },
      ]}
      accessible
      accessibilityRole={isError ? "alert" : undefined}
      accessibilityLiveRegion={isError ? "assertive" : "polite"}
      accessibilityLabel={message}
    >
      <Icon name={v.icon} size={20} color={v.text} style={{ marginRight: spacing.sm }} />
      <Text variant="bodySm" color={v.text} style={styles.message}>
        {message}
      </Text>
      {onDismiss && (
        <Pressable
          onPress={onDismiss}
          style={[styles.dismissButton, { marginRight: -spacing.sm }]}
          accessibilityLabel="Dismiss"
          accessibilityRole="button"
        >
          <Icon name="close" size={18} color={v.text} />
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
  dismissButton: {
    minWidth: 44,
    minHeight: 44,
    justifyContent: "center",
    alignItems: "center",
  },
});
