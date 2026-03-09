import { useEffect } from 'react';
import { View, type ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useTheme } from '../../providers/ThemeProvider';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ProgressBarProps {
  /** Spent portion 0–1 of budget/goal already consumed (darker shade). */
  spent: number;
  /** Total funded portion 0–1 (spent + available). The lighter area extends from spent to this value. */
  available: number;
  /** Status color (green/yellow/red). Spent uses this darkened, available uses it at 50% opacity. */
  color: string;
  /** Category is overspent — fills entire bar with the color (no animation). */
  overspent?: boolean;
  /** Height in px. */
  height?: number;
  style?: ViewStyle;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TIMING_CONFIG = { duration: 350, easing: Easing.out(Easing.cubic) };

/** Adjust a hex color's brightness. factor > 0 = lighten, < 0 = darken. */
function adjustBrightness(hex: string, factor: number): string {
  const clean = hex.replace('#', '').slice(0, 6);
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);

  const adjust = (c: number) => {
    if (factor > 0) return Math.min(255, Math.round(c + (255 - c) * factor));
    return Math.max(0, Math.round(c * (1 + factor)));
  };

  return `#${adjust(r).toString(16).padStart(2, '0')}${adjust(g).toString(16).padStart(2, '0')}${adjust(b).toString(16).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProgressBar({
  spent,
  available,
  color,
  overspent = false,
  height = 8,
  style,
}: ProgressBarProps) {
  const { colors } = useTheme();

  const spentWidth = useSharedValue(spent);
  const availableWidth = useSharedValue(available);

  useEffect(() => {
    spentWidth.value = withTiming(spent, TIMING_CONFIG);
  }, [spent]);

  useEffect(() => {
    availableWidth.value = withTiming(available, TIMING_CONFIG);
  }, [available]);

  const spentStyle = useAnimatedStyle(() => ({
    width: `${Math.round(spentWidth.value * 100)}%` as unknown as number,
  }));

  const availableStyle = useAnimatedStyle(() => ({
    width: `${Math.round(availableWidth.value * 100)}%` as unknown as number,
  }));

  const borderRadius = height / 2;
  const spentColor = adjustBrightness(color, -0.15);
  const availableColor = color + '50';

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
          overflow: 'hidden',
        },
        style,
      ]}
    >
      {overspent ? (
        /* Overspent: full bar in status color (static) */
        <View
          style={{
            position: 'absolute',
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
          {/* Available layer (lighter, behind spent) — total funded width */}
          {available > 0 && (
            <Animated.View
              style={[
                {
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  bottom: 0,
                  borderRadius,
                  backgroundColor: availableColor,
                },
                availableStyle,
              ]}
            />
          )}

          {/* Spent layer (darker, on top from left) */}
          {spent > 0 && (
            <Animated.View
              style={[
                {
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  bottom: 0,
                  borderRadius,
                  backgroundColor: spentColor,
                },
                spentStyle,
              ]}
            />
          )}
        </>
      )}
    </View>
  );
}
