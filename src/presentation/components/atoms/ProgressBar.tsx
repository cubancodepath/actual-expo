import { useEffect } from "react";
import { View, type ViewStyle } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  useReducedMotion,
  Easing,
} from "react-native-reanimated";
import Svg, { Defs, Pattern, Line, Rect } from "react-native-svg";
import { useTheme } from "../../providers/ThemeProvider";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ProgressBarProps {
  /** Spent portion 0–1 of budget/goal already consumed (shown as diagonal stripes). */
  spent: number;
  /** Total funded portion 0–1 (spent + available). Solid color behind spent stripes. */
  available: number;
  /** Status color (green/yellow/red). Available uses this solid, spent uses striped overlay. */
  color: string;
  /** Category is overspent — fills entire bar with the color (no stripes). */
  overspent?: boolean;
  /** Show diagonal stripes on spent layer. Set false for savings goals (solid bar). */
  striped?: boolean;
  /** Height in px. */
  height?: number;
  style?: ViewStyle;
}

// ---------------------------------------------------------------------------
// Stripe pattern
// ---------------------------------------------------------------------------

/** Diagonal stripe pattern using SVG — renders white semi-transparent lines over the base color. */
function StripedFill({ color, height }: { color: string; height: number }) {
  return (
    <Svg width="100%" height={height}>
      <Defs>
        <Pattern
          id="stripes"
          x="0"
          y="0"
          width="6"
          height="6"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(-45)"
        >
          <Line x1="0" y1="0" x2="0" y2="6" stroke={color} strokeWidth="3" />
        </Pattern>
      </Defs>
      <Rect width="100%" height={height} fill="url(#stripes)" />
    </Svg>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TIMING_CONFIG = { duration: 350, easing: Easing.out(Easing.cubic) };

/** Adjust a hex color's brightness. factor > 0 = lighten, < 0 = darken. */
function adjustBrightness(hex: string, factor: number): string {
  const clean = hex.replace("#", "").slice(0, 6);
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);

  const adjust = (c: number) => {
    if (factor > 0) return Math.min(255, Math.round(c + (255 - c) * factor));
    return Math.max(0, Math.round(c * (1 + factor)));
  };

  return `#${adjust(r).toString(16).padStart(2, "0")}${adjust(g).toString(16).padStart(2, "0")}${adjust(b).toString(16).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProgressBar({
  spent,
  available,
  color,
  overspent = false,
  striped = true,
  height = 8,
  style,
}: ProgressBarProps) {
  const { colors } = useTheme();
  const reducedMotion = useReducedMotion();

  const spentWidth = useSharedValue(spent);
  const availableWidth = useSharedValue(available);

  useEffect(() => {
    spentWidth.value = reducedMotion ? spent : withTiming(spent, TIMING_CONFIG);
  }, [spent, reducedMotion]);

  useEffect(() => {
    availableWidth.value = reducedMotion ? available : withTiming(available, TIMING_CONFIG);
  }, [available, reducedMotion]);

  const spentStyle = useAnimatedStyle(() => ({
    width: `${Math.round(spentWidth.value * 100)}%` as unknown as number,
  }));

  const availableStyle = useAnimatedStyle(() => ({
    width: `${Math.round(availableWidth.value * 100)}%` as unknown as number,
  }));

  const borderRadius = height / 2;
  const spentBgColor = adjustBrightness(color, -0.25);

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{
        min: 0,
        max: 100,
        now: Math.round((overspent ? 1 : spent) * 100),
      }}
      style={[
        {
          height,
          borderRadius,
          backgroundColor: colors.divider,
          overflow: "hidden",
        },
        style,
      ]}
    >
      {overspent ? (
        /* Overspent: full bar in status color (static, no stripes) */
        <View
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            right: 0,
            borderRadius,
            backgroundColor: color,
          }}
        />
      ) : (
        <>
          {/* Available layer (solid color — total budgeted width) */}
          {available > 0 && (
            <Animated.View
              style={[
                {
                  position: "absolute",
                  left: 0,
                  top: 0,
                  bottom: 0,
                  borderRadius,
                  backgroundColor: color,
                },
                availableStyle,
              ]}
            />
          )}

          {/* Spent layer (darker bg + striped overlay — consumed portion) */}
          {spent > 0 && striped && (
            <Animated.View
              style={[
                {
                  position: "absolute",
                  left: 0,
                  top: 0,
                  bottom: 0,
                  borderRadius,
                  overflow: "hidden",
                  backgroundColor: spentBgColor,
                },
                spentStyle,
              ]}
            >
              <StripedFill color="rgba(0,0,0,0.25)" height={height} />
            </Animated.View>
          )}
        </>
      )}
    </View>
  );
}
