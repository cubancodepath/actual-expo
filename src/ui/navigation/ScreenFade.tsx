import { isLiquidGlassAvailable } from "expo-glass-effect";
import { LinearGradient } from "expo-linear-gradient";
import { colorKit, useThemeColor } from "heroui-native";
import { Platform, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type ScreenFadeEdge = "top" | "bottom";

export interface ScreenFadeProps {
  edge?: ScreenFadeEdge;
  height?: number;
}

const DEFAULT_FADE_HEIGHT_PX = 96;

/**
 * Skip the fade where the OS already separates the floating bar from content
 * (iOS liquid glass). Everywhere else it softens the seam behind the bar.
 */
const shouldRenderFade = (): boolean => {
  if (Platform.OS === "android") {
    return true;
  }
  return Platform.OS === "ios" && !isLiquidGlassAvailable();
};

export const ScreenFade = ({
  edge = "top",
  height,
}: ScreenFadeProps): React.ReactElement | null => {
  const insets = useSafeAreaInsets();
  const backgroundColor = useThemeColor("background");
  const fadeTransparent = colorKit.setAlpha(backgroundColor, 0).hex();

  if (!shouldRenderFade()) {
    return null;
  }

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
};
