import { useEffect } from 'react';
import { View, type ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
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
  /** Category is overspent — fills entire bar red with pulsing animation. */
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
  height = 6,
  style,
}: ProgressBarProps) {
  const { colors } = useTheme();

  const spentWidth = useSharedValue(spent);
  const availableWidth = useSharedValue(available);
  const pulseOpacity = useSharedValue(1);

  useEffect(() => {
    spentWidth.value = withTiming(spent, TIMING_CONFIG);
  }, [spent]);

  useEffect(() => {
    availableWidth.value = withTiming(available, TIMING_CONFIG);
  }, [available]);

  // Pulse animation for overspent state
  useEffect(() => {
    if (overspent) {
      pulseOpacity.value = withRepeat(
        withSequence(
          withTiming(0.55, { duration: 800, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 800, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
        false,
      );
    } else {
      pulseOpacity.value = withTiming(1, { duration: 200 });
    }
  }, [overspent]);

  const spentStyle = useAnimatedStyle(() => ({
    width: `${Math.round(spentWidth.value * 100)}%` as unknown as number,
  }));

  const availableStyle = useAnimatedStyle(() => ({
    width: `${Math.round(availableWidth.value * 100)}%` as unknown as number,
  }));

  const overspentStyle = useAnimatedStyle(() => ({
    opacity: pulseOpacity.value,
  }));

  const borderRadius = height / 2;
  const spentColor = adjustBrightness(color, -0.15);
  const availableColor = color + '50';

  return (
    <View
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
        /* Overspent: full red bar with pulse */
        <Animated.View
          style={[
            {
              position: 'absolute',
              left: 0,
              top: 0,
              bottom: 0,
              right: 0,
              borderRadius,
              backgroundColor: color,
            },
            overspentStyle,
          ]}
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
