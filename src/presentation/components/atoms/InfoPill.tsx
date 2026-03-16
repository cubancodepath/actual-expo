import { Pressable, View, type ViewStyle } from "react-native";
import { useTheme } from "../../providers/ThemeProvider";

interface InfoPillProps {
  /** Left-side content (icon + amount, badge + text, etc.) */
  left: React.ReactNode;
  /** Right-side content (label + chevron, action button, etc.) */
  right?: React.ReactNode;
  /** Pill background color. */
  backgroundColor: string;
  /** If provided, renders a 1px border. */
  borderColor?: string;
  /** Tap handler — renders Pressable if provided. */
  onPress?: () => void;
  /** Accessibility label for the pill. */
  accessibilityLabel: string;
  /** Outer style overrides (margins, etc.) */
  style?: ViewStyle;
}

export function InfoPill({
  left,
  right,
  backgroundColor,
  borderColor,
  onPress,
  accessibilityLabel,
  style,
}: InfoPillProps) {
  const { spacing, borderRadius: br } = useTheme();

  const pillStyle: ViewStyle = {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor,
    marginHorizontal: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: 11,
    borderRadius: br.full,
    minHeight: 44,
    ...(borderColor ? { borderWidth: 1, borderColor } : {}),
  };

  const content = (
    <View style={[pillStyle, style]}>
      {left}
      {right}
    </View>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => pressed && { opacity: 0.72 }}
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
      >
        {content}
      </Pressable>
    );
  }

  return <View accessibilityLabel={accessibilityLabel}>{content}</View>;
}
