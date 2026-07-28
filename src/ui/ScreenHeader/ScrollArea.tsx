import { cloneElement, isValidElement, useMemo, useState, type Ref, type ReactNode } from "react";
import {
  StyleSheet,
  View,
  type RefreshControlProps,
  type ScrollView,
  type ScrollViewProps,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
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
import { useSurfaceLevel } from "../surface-level";
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
}: {
  children: ReactNode;
  /**
   * Container classes. Replaces the default background — pass e.g.
   * `"bg-transparent"` when the area sits inside a surface that paints its own
   * (rounded) background, like a bottom sheet.
   */
  className?: string;
}) {
  const scrollOffset = useSharedValue(0);
  const [headerHeight, setHeaderHeight] = useState(HEADER_HEIGHT_FALLBACK);
  // The canvas follows the presentation context rather than being hard-coded:
  // the same screen scaffold is used both as a pushed route and inside a modal
  // stack, and those are different rungs of the elevation ladder.
  const { canvas } = useSurfaceLevel();

  const value = useMemo(
    () => ({ scrollOffset, headerHeight, setHeaderHeight }),
    [scrollOffset, headerHeight],
  );

  return (
    <ScreenHeaderScrollContext value={value}>
      <View className={`flex-1 ${className ?? canvas}`}>{children}</View>
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
  /**
   * Scroll a focused input above the *system* keyboard (via
   * react-native-keyboard-controller). Opt-in: pass it on screens with real
   * text fields near the bottom. Screens driven by the custom AmountKeyboard
   * don't need it — that panel isn't the system keyboard.
   */
  keyboardAware?: boolean;
  /** Gap kept between the focused field and the keyboard top. */
  bottomOffset?: number;
};

export function ScreenHeaderBody({
  ref,
  children,
  style,
  contentContainerStyle,
  onScrollY,
  keyboardAware = false,
  bottomOffset = 24,
  refreshControl,
  ...rest
}: ScreenHeaderBodyProps) {
  const { scrollOffset, headerHeight } = useScreenHeaderScrollContext();

  const onScroll = useAnimatedScrollHandler((e) => {
    scrollOffset.value = e.contentOffset.y;
    if (onScrollY) runOnJS(onScrollY)(e.contentOffset.y);
  });

  // The header floats over the scroll content (paddingTop = headerHeight), so a
  // RefreshControl's spinner would sit at y=0, behind the header row. Offset it
  // by the same measured header height so it appears just below the header —
  // the caller can't do this itself (it's above the ScrollArea provider). An
  // explicit progressViewOffset on the passed control still wins.
  const offsetRefreshControl =
    isValidElement<RefreshControlProps>(refreshControl) &&
    refreshControl.props.progressViewOffset === undefined
      ? cloneElement(refreshControl, { progressViewOffset: headerHeight })
      : refreshControl;

  const scrollProps = {
    ref,
    scrollEventThrottle: 16,
    showsVerticalScrollIndicator: false,
    ...rest,
    refreshControl: offsetRefreshControl,
    onScroll,
    style: [styles.fill, style],
    contentContainerStyle: [{ paddingTop: headerHeight }, contentContainerStyle],
  };

  // Keyboard-aware variant renders the same Animated.ScrollView underneath (so
  // our `onScroll` worklet still drives the header blur) but lets the keyboard
  // controller scroll the focused field into view above the system keyboard.
  if (keyboardAware) {
    return (
      <KeyboardAwareScrollView
        ScrollViewComponent={Animated.ScrollView}
        bottomOffset={bottomOffset}
        // KAV's public props are ScrollViewProps, narrower than the
        // Animated.ScrollView it actually renders (animated onScroll/style).
        {...(scrollProps as unknown as ScrollViewProps)}
      >
        {children as ReactNode}
      </KeyboardAwareScrollView>
    );
  }

  return <Animated.ScrollView {...scrollProps}>{children}</Animated.ScrollView>;
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
