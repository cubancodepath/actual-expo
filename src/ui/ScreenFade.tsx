import { Platform, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { isLiquidGlassAvailable } from "expo-glass-effect";
import { LinearGradient } from "expo-linear-gradient";
import { colorKit, useThemeColor } from "heroui-native";

type ScreenFadeEdge = "top" | "bottom";

export interface ScreenFadeProps {
  edge?: ScreenFadeEdge;
  /** Overrides the default height (96 + the edge's safe-area inset). */
  height?: number;
}

const DEFAULT_FADE_HEIGHT_PX = 96;

/**
 * The frosted edge under a transparent native header (or over a floating tab
 * bar): a gradient from the theme background to fully transparent.
 *
 * Ported from the HeroUI fitness example. Two details are load-bearing:
 *
 * - On iOS 26 the system already paints liquid glass behind a transparent
 *   header, so the gradient is skipped entirely — drawing both would stack two
 *   effects. It is the fallback for older iOS, not the main event.
 * - The transparent stop comes from `colorKit.setAlpha(bg, 0)`, not the string
 *   `"transparent"`, which Android interpolates through black.
 */
export function ScreenFade({ edge = "top", height }: ScreenFadeProps) {
  const insets = useSafeAreaInsets();
  const backgroundColor = useThemeColor("background");
  const fadeTransparent = colorKit.setAlpha(backgroundColor, 0).hex();

  if (Platform.OS === "ios" && isLiquidGlassAvailable()) return null;

  const isTop = edge === "top";
  const edgeInset = isTop ? insets.top : insets.bottom;
  const resolvedHeight = height ?? DEFAULT_FADE_HEIGHT_PX + edgeInset;
  const colors: readonly [string, string] = isTop
    ? [backgroundColor, fadeTransparent]
    : [fadeTransparent, backgroundColor];

  const style: ViewStyle = {
    position: "absolute",
    left: 0,
    right: 0,
    height: resolvedHeight,
    ...(isTop ? { top: 0 } : { bottom: 0 }),
  };

  return <LinearGradient pointerEvents="none" colors={colors} style={style} />;
}
