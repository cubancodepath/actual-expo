import type { ReactNode } from "react";
import { Pressable, View, type ViewStyle } from "react-native";
import Animated, { type AnimatedStyle } from "react-native-reanimated";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import { BlurView } from "expo-blur";
import { SymbolView } from "expo-symbols";
import type { SFSymbol } from "sf-symbols-typescript";
import { useTheme } from "../../providers/ThemeProvider";
import { Text } from "./Text";

const glass = isLiquidGlassAvailable();

const AnimatedGlassView = Animated.createAnimatedComponent(GlassView);
const AnimatedBlurView = Animated.createAnimatedComponent(BlurView);

type GlassButtonProps = {
  onPress?: () => void;
  /** SF Symbol name (e.g. "xmark", "chevron.left") */
  icon?: SFSymbol;
  /** Icon size — defaults to 22 */
  iconSize?: number;
  /** Text label (renders pill shape) */
  label?: string;
  /** Icon/text color — defaults to textPrimary */
  color?: string;
  /** Render style: 'glass' (default) or 'tinted' (solid fill, no glass) */
  variant?: "glass" | "tinted";
  /** Tinted fill color — defaults to theme primary */
  tintColor?: string;
  /** Additional style on outer wrapper */
  style?: ViewStyle;
  /** Arbitrary children (overrides icon/label) */
  children?: ReactNode;
  hitSlop?: number;
  /** Animated style for the outer container (borderRadius, etc.) */
  animatedContainerStyle?: AnimatedStyle<ViewStyle>;
  /** Animated style for the inner content (paddingHorizontal, etc.) */
  animatedInnerStyle?: AnimatedStyle<ViewStyle>;
};

const SIZE = 48;

export function GlassButton({
  onPress,
  icon,
  iconSize = 22,
  label,
  color: colorProp,
  variant = "glass",
  tintColor,
  style,
  children,
  hitSlop = 8,
  animatedContainerStyle,
  animatedInnerStyle,
}: GlassButtonProps) {
  const { colors, spacing, borderRadius: br } = useTheme();
  const iconColor = colorProp ?? colors.textPrimary;
  const fill = tintColor ?? colors.primary;

  const hasLabel = !!label;
  const hasChildren = !!children;

  // Build inner content
  const content = hasChildren ? (
    children
  ) : (
    <>
      {icon && (
        <SymbolView
          name={icon}
          size={iconSize}
          tintColor={variant === "tinted" ? colors.primaryText : iconColor}
        />
      )}
      {hasLabel && (
        <Text
          variant="body"
          color={variant === "tinted" ? colors.primaryText : iconColor}
          style={{ fontWeight: "600" }}
          numberOfLines={1}
        >
          {label}
        </Text>
      )}
    </>
  );

  // Round (icon-only, no label/children) vs pill (has label or children)
  const isPill = hasLabel || hasChildren;

  const innerStyle: ViewStyle = isPill
    ? {
        flexDirection: "row",
        alignItems: "center",
        height: SIZE,
        paddingHorizontal: spacing.lg,
        gap: spacing.xs,
      }
    : {
        width: SIZE,
        height: SIZE,
        alignItems: "center",
        justifyContent: "center",
      };

  const hasAnimatedStyles = animatedContainerStyle || animatedInnerStyle;

  if (variant === "tinted") {
    return (
      <View style={[{ borderRadius: isPill ? br.full : SIZE / 2, overflow: "hidden" }, style]}>
        <Pressable
          onPress={onPress}
          hitSlop={hitSlop}
          style={({ pressed }) => [
            innerStyle,
            { backgroundColor: fill },
            pressed && { opacity: 0.8 },
          ]}
        >
          {content}
        </Pressable>
      </View>
    );
  }

  // Glass variant
  const radius = isPill ? br.full : SIZE / 2;

  if (hasAnimatedStyles) {
    return (
      <Animated.View
        style={[{ borderRadius: radius, overflow: "hidden" }, style, animatedContainerStyle]}
      >
        <Pressable onPress={onPress} hitSlop={hitSlop}>
          {glass ? (
            <AnimatedGlassView
              isInteractive
              style={[{ borderRadius: radius, ...innerStyle }, animatedInnerStyle]}
            >
              {content}
            </AnimatedGlassView>
          ) : (
            <AnimatedBlurView
              tint="systemChromeMaterial"
              intensity={100}
              style={[innerStyle, animatedInnerStyle]}
            >
              {content}
            </AnimatedBlurView>
          )}
        </Pressable>
      </Animated.View>
    );
  }

  return (
    <View style={[{ borderRadius: radius, overflow: "hidden" }, style]}>
      <Pressable onPress={onPress} hitSlop={hitSlop}>
        {glass ? (
          <GlassView isInteractive style={{ borderRadius: radius, ...innerStyle }}>
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
