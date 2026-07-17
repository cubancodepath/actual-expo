import { useMemo, useState, type Ref, type ReactNode } from "react";
import { StyleSheet, View, type ScrollView } from "react-native";
import MaskedView from "@react-native-masked-view/masked-view";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedProps,
  useAnimatedScrollHandler,
  useSharedValue,
  type AnimatedScrollViewProps,
} from "react-native-reanimated";
import { ScreenHeaderScrollContext, useScreenHeaderScrollContext } from "./context";

const AnimatedBlurView = Animated.createAnimatedComponent(BlurView);

/** Scroll distance over which the header blur ramps up. */
const FADE_DISTANCE = 32;
/** Max blur intensity — kept subtle. */
const MAX_INTENSITY = 12;
/** Header height used for the first frame, before `onLayout` measures it. */
const HEADER_HEIGHT_FALLBACK = 120;

/**
 * Provider + full-height container for a scroll-aware header. Holds the scroll
 * offset (a shared value) and the measured header height, and exposes them to
 * {@link ScreenHeaderBody} and {@link ScreenHeaderFloating} via context.
 */
export function ScreenHeaderScrollArea({
  children,
  className,
  frameless = false,
}: {
  children: ReactNode;
  /**
   * Container classes. Replaces the default background — pass e.g.
   * `"bg-transparent"` when the area sits inside a surface that paints its own
   * (rounded) background, like a bottom sheet. Ignored with `frameless`.
   */
  className?: string;
  /**
   * Render only the context provider, no container View — for screens
   * presented as a native formSheet, where a plain flex-1 View root does not
   * paint its scroll content (same quirk AmountSheet.Body documents). The
   * Body becomes the screen's root-level scroll and the Floating header
   * positions against the screen itself; the sheet's `contentStyle` owns the
   * background.
   */
  frameless?: boolean;
}) {
  const scrollOffset = useSharedValue(0);
  const [headerHeight, setHeaderHeight] = useState(HEADER_HEIGHT_FALLBACK);

  const value = useMemo(
    () => ({ scrollOffset, headerHeight, setHeaderHeight }),
    [scrollOffset, headerHeight],
  );

  if (frameless) {
    return <ScreenHeaderScrollContext value={value}>{children}</ScreenHeaderScrollContext>;
  }
  return (
    <ScreenHeaderScrollContext value={value}>
      <View className={`flex-1 ${className ?? "bg-background"}`}>{children}</View>
    </ScreenHeaderScrollContext>
  );
}

/**
 * The scrolling content under a floating header. An `Animated.ScrollView` that
 * reports its offset to the header (native thread) and reserves top padding for
 * the header's measured height. Extra `contentContainerStyle` is merged on top.
 */
type ScreenHeaderBodyProps = AnimatedScrollViewProps & {
  ref?: Ref<ScrollView>;
  /**
   * Called with the scroll offset on the JS thread — a bridge for consumers that
   * need it (e.g. the in-app keyboard avoidance) without owning `onScroll`, which
   * this component already uses to drive the header blur.
   */
  onScrollY?: (y: number) => void;
};

export function ScreenHeaderBody({
  ref,
  children,
  style,
  contentContainerStyle,
  onScrollY,
  ...rest
}: ScreenHeaderBodyProps) {
  const { scrollOffset, headerHeight } = useScreenHeaderScrollContext();

  const onScroll = useAnimatedScrollHandler((e) => {
    scrollOffset.value = e.contentOffset.y;
    if (onScrollY) runOnJS(onScrollY)(e.contentOffset.y);
  });

  return (
    <Animated.ScrollView
      ref={ref}
      scrollEventThrottle={16}
      showsVerticalScrollIndicator={false}
      {...rest}
      onScroll={onScroll}
      style={[styles.fill, style]}
      contentContainerStyle={[{ paddingTop: headerHeight }, contentContainerStyle]}
    >
      {children}
    </Animated.ScrollView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});

/**
 * Fixed header overlay whose frosted blur ramps up as {@link ScreenHeaderBody}
 * scrolls underneath. Blur is animated via `intensity` (iOS blur views ignore
 * opacity) and masked by a vertical gradient so it dissolves to transparent at
 * its bottom edge — no color band, no hard line. Renders `children` (typically a
 * `<ScreenHeader>` row, optionally followed by a search field / subheader).
 */
export function ScreenHeaderFloating({ children }: { children: ReactNode }) {
  const { scrollOffset, setHeaderHeight } = useScreenHeaderScrollContext();

  const blurProps = useAnimatedProps(() => ({
    intensity: interpolate(
      scrollOffset.value,
      [0, FADE_DISTANCE],
      [0, MAX_INTENSITY],
      Extrapolation.CLAMP,
    ),
  }));

  return (
    <View
      className="absolute inset-x-0 top-0"
      onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}
    >
      <MaskedView
        style={StyleSheet.absoluteFill}
        maskElement={
          <LinearGradient
            colors={["#000", "#000", "transparent"]}
            locations={[0, 0.78, 1]}
            style={StyleSheet.absoluteFill}
          />
        }
      >
        <AnimatedBlurView
          tint="systemChromeMaterial"
          animatedProps={blurProps}
          style={StyleSheet.absoluteFill}
        />
      </MaskedView>
      {children}
    </View>
  );
}
