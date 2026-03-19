import { Pressable, View, type ViewStyle } from "react-native";
import { GlassView, isLiquidGlassAvailable, type GlassStyle } from "expo-glass-effect";
import { BlurView } from "expo-blur";
import { useTheme } from "../../providers/ThemeProvider";
import { Icon } from "./Icon";
import type { IconName } from "./iconRegistry";
import { Text } from "./Text";
import { triggerHaptic, type HapticType } from "./haptics";

const glass = isLiquidGlassAvailable();

type GlassButtonProps = {
  onPress?: () => void;
  icon?: IconName;
  iconSize?: number;
  label?: string;
  color?: string;
  variant?: "glass" | "tinted";
  tintColor?: string;
  glassEffectStyle?: GlassStyle;
  haptic?: HapticType;
  disabled?: boolean;
  style?: ViewStyle;
  hitSlop?: number;
};

export function GlassButton({
  onPress,
  icon,
  iconSize = 22,
  label,
  color: colorProp,
  variant = "glass",
  tintColor,
  glassEffectStyle = "regular",
  haptic,
  disabled = false,
  style,
  hitSlop = 8,
}: GlassButtonProps) {
  const { colors, sizes } = useTheme();
  const SIZE = sizes.control;
  const isCircle = !!icon && !label;
  const fill = tintColor ?? colors.primary;

  const contentColor =
    variant === "tinted" ? colors.primaryText : (colorProp ?? colors.textPrimary);

  const content = icon ? (
    <Icon name={icon} size={iconSize} color={contentColor} />
  ) : label ? (
    <Text variant="body" color={contentColor} style={{ fontWeight: "600" }} numberOfLines={1}>
      {label}
    </Text>
  ) : null;

  function handlePress() {
    if (haptic) triggerHaptic(haptic);
    onPress?.();
  }

  const innerStyle: ViewStyle = isCircle
    ? { width: SIZE, height: SIZE, alignItems: "center", justifyContent: "center" }
    : { height: SIZE, paddingHorizontal: 16, alignItems: "center", justifyContent: "center" };

  const radius = isCircle ? SIZE / 2 : 9999;

  if (variant === "tinted") {
    return (
      <View
        style={[{ borderRadius: radius, borderCurve: "continuous", overflow: "hidden" }, style]}
      >
        <Pressable
          onPress={handlePress}
          disabled={disabled}
          hitSlop={hitSlop}
          style={({ pressed }) => [
            innerStyle,
            { backgroundColor: fill },
            pressed && { opacity: 0.8 },
            disabled && { opacity: 0.4 },
          ]}
        >
          {content}
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[{ borderRadius: radius, borderCurve: "continuous", overflow: "hidden" }, style]}>
      <Pressable
        onPress={onPress}
        disabled={disabled}
        hitSlop={hitSlop}
        style={disabled ? { opacity: 0.4 } : undefined}
      >
        {glass ? (
          <GlassView
            isInteractive
            glassEffectStyle={glassEffectStyle}
            style={{ borderRadius: radius, ...innerStyle }}
          >
            {content}
          </GlassView>
        ) : (
          <BlurView tint="systemChromeMaterial" intensity={100} style={innerStyle}>
            {content}
          </BlurView>
        )}
      </Pressable>
    </View>
  );
}
