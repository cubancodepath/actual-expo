/**
 * AnimatedView — Reanimated-based drop-in replacement for react-native-ease's EaseView.
 *
 * Supports: opacity, scale, scaleX, scaleY, translateX, translateY, rotate,
 * backgroundColor, borderRadius. Spring, timing, and none transitions.
 * initialAnimate for mount animations, onTransitionEnd callback, loop.
 */

import { useEffect, useRef, type ReactNode } from "react";
import type { ViewStyle } from "react-native";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
  type SharedValue,
  type WithTimingConfig,
  type WithSpringConfig,
} from "react-native-reanimated";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AnimateProps {
  opacity?: number;
  scale?: number;
  scaleX?: number;
  scaleY?: number;
  translateX?: number;
  translateY?: number;
  rotate?: number;
  backgroundColor?: string;
  borderRadius?: number;
}

type TransitionConfig =
  | { type: "spring"; damping?: number; stiffness?: number; mass?: number }
  | {
      type: "timing";
      duration?: number;
      easing?: string | number[];
      loop?: "reverse" | "repeat";
    }
  | { type: "none" };

interface AnimatedViewProps {
  animate: AnimateProps;
  initialAnimate?: AnimateProps;
  transition: TransitionConfig;
  transformOrigin?: { x: number; y: number };
  onTransitionEnd?: (result: { finished: boolean }) => void;
  style?: ViewStyle | ViewStyle[];
  children?: ReactNode;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveEasing(easing?: string | number[]): WithTimingConfig["easing"] {
  if (!easing) return Easing.bezier(0.42, 0, 0.58, 1); // easeInOut default
  if (Array.isArray(easing)) {
    const [a, b, c, d] = easing;
    return Easing.bezier(a, b, c, d);
  }
  switch (easing) {
    case "easeIn":
      return Easing.in(Easing.ease);
    case "easeOut":
      return Easing.out(Easing.ease);
    case "easeInOut":
      return Easing.inOut(Easing.ease);
    case "linear":
      return Easing.linear;
    default:
      return Easing.inOut(Easing.ease);
  }
}

function driveValue(
  sv: SharedValue<number>,
  target: number,
  transition: TransitionConfig,
  onEnd?: (result: { finished: boolean }) => void,
) {
  if (transition.type === "none") {
    sv.value = target;
    if (onEnd) onEnd({ finished: true });
    return;
  }
  if (transition.type === "spring") {
    const config: WithSpringConfig = {
      damping: transition.damping ?? 10,
      stiffness: transition.stiffness ?? 100,
      mass: transition.mass ?? 1,
    };
    sv.value = onEnd
      ? withSpring(target, config, (finished) => {
          if (onEnd) runOnJS(onEnd)({ finished: finished ?? false });
        })
      : withSpring(target, config);
    return;
  }
  // timing
  const config: WithTimingConfig = {
    duration: transition.duration ?? 300,
    easing: resolveEasing(transition.easing),
  };
  if (transition.loop) {
    const anim = withTiming(target, config);
    sv.value = withRepeat(anim, -1, transition.loop === "reverse");
    return;
  }
  sv.value = onEnd
    ? withTiming(target, config, (finished) => {
        if (onEnd) runOnJS(onEnd)({ finished: finished ?? false });
      })
    : withTiming(target, config);
}

function resolveTransformOrigin(to?: { x: number; y: number }): string | undefined {
  if (!to) return undefined;
  const xMap: Record<number, string> = { 0: "left", 0.5: "center", 1: "right" };
  const yMap: Record<number, string> = { 0: "top", 0.5: "center", 1: "bottom" };
  const x = xMap[to.x] ?? `${to.x * 100}%`;
  const y = yMap[to.y] ?? `${to.y * 100}%`;
  return `${x} ${y}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AnimatedView({
  animate,
  initialAnimate,
  transition,
  transformOrigin,
  onTransitionEnd,
  style,
  children,
}: AnimatedViewProps) {
  const isFirst = useRef(true);

  // Shared values — initialAnimate values used on first render, else animate values
  const init = isFirst.current && initialAnimate ? initialAnimate : animate;

  const opacity = useSharedValue(init.opacity ?? 1);
  const scale = useSharedValue(init.scale ?? 1);
  const scaleX = useSharedValue(init.scaleX ?? 1);
  const scaleY = useSharedValue(init.scaleY ?? 1);
  const translateX = useSharedValue(init.translateX ?? 0);
  const translateY = useSharedValue(init.translateY ?? 0);
  const rotate = useSharedValue(init.rotate ?? 0);
  const borderRadius = useSharedValue(init.borderRadius ?? -1);
  const bgColor = useSharedValue(init.backgroundColor ?? "transparent");

  useEffect(() => {
    // Track last animated value to only call onEnd once (on the last prop driven)
    let lastDriven = false;
    const onEndOnce = onTransitionEnd
      ? (result: { finished: boolean }) => {
          if (!lastDriven) {
            lastDriven = true;
            onTransitionEnd(result);
          }
        }
      : undefined;

    if (animate.opacity != null) driveValue(opacity, animate.opacity, transition);
    if (animate.scale != null) driveValue(scale, animate.scale, transition);
    if (animate.scaleX != null) driveValue(scaleX, animate.scaleX, transition);
    if (animate.scaleY != null) driveValue(scaleY, animate.scaleY, transition);
    if (animate.translateX != null) driveValue(translateX, animate.translateX, transition);
    if (animate.translateY != null) driveValue(translateY, animate.translateY, transition);
    if (animate.rotate != null) driveValue(rotate, animate.rotate, transition);
    if (animate.borderRadius != null) driveValue(borderRadius, animate.borderRadius, transition);

    // backgroundColor: timing/spring string interpolation
    if (animate.backgroundColor != null) {
      if (transition.type === "none") {
        bgColor.value = animate.backgroundColor;
        if (onEndOnce) onEndOnce({ finished: true });
      } else if (transition.type === "timing") {
        bgColor.value = withTiming(animate.backgroundColor as unknown as number, {
          duration: transition.duration ?? 300,
        }) as unknown as string;
      } else {
        bgColor.value = animate.backgroundColor;
      }
    }

    // Fire onEnd for the last numeric property (rotate as sentinel, or opacity)
    if (onEndOnce && animate.rotate != null) {
      driveValue(rotate, animate.rotate, transition, onEndOnce);
    } else if (onEndOnce && animate.opacity != null) {
      driveValue(opacity, animate.opacity, transition, onEndOnce);
    } else if (onEndOnce && animate.translateX != null) {
      driveValue(translateX, animate.translateX, transition, onEndOnce);
    }

    isFirst.current = false;
  }, [
    animate.opacity,
    animate.scale,
    animate.scaleX,
    animate.scaleY,
    animate.translateX,
    animate.translateY,
    animate.rotate,
    animate.backgroundColor,
    animate.borderRadius,
    transition.type,
  ]);

  const animatedStyle = useAnimatedStyle(() => {
    const s: Record<string, unknown> = {
      opacity: opacity.value,
      transform: [
        { translateX: translateX.value },
        { translateY: translateY.value },
        { scale: scale.value },
        { scaleX: scaleX.value },
        { scaleY: scaleY.value },
        { rotate: `${rotate.value}deg` },
      ],
    };
    if (borderRadius.value >= 0) {
      s.borderRadius = borderRadius.value;
    }
    if (bgColor.value !== "transparent") {
      s.backgroundColor = bgColor.value;
    }
    return s;
  });

  const originStyle = resolveTransformOrigin(transformOrigin);

  return (
    <Animated.View
      style={[style, originStyle ? { transformOrigin: originStyle } : undefined, animatedStyle]}
    >
      {children}
    </Animated.View>
  );
}
