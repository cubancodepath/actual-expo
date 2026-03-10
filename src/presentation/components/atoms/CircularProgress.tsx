import { useEffect } from 'react';
import { View, type ViewStyle } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedProps,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useTheme } from '../../providers/ThemeProvider';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const TIMING_CONFIG = { duration: 350, easing: Easing.out(Easing.cubic) };

interface CircularProgressProps {
  /** Progress 0–1 */
  progress: number;
  /** Ring color */
  color: string;
  /** Outer diameter */
  size?: number;
  /** Stroke width */
  strokeWidth?: number;
  /** Optional center content (icon, text) */
  children?: React.ReactNode;
  style?: ViewStyle;
}

export function CircularProgress({
  progress,
  color,
  size = 64,
  strokeWidth = 6,
  children,
  style,
}: CircularProgressProps) {
  const { colors } = useTheme();

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  const animatedProgress = useSharedValue(progress);

  useEffect(() => {
    animatedProgress.value = withTiming(
      Math.max(0, Math.min(progress, 1)),
      TIMING_CONFIG,
    );
  }, [progress]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - animatedProgress.value),
  }));

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{
        min: 0,
        max: 100,
        now: Math.round(Math.max(0, Math.min(progress, 1)) * 100),
      }}
      style={[{ width: size, height: size }, style]}
    >
      <Svg width={size} height={size}>
        {/* Background track */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={colors.divider}
          strokeWidth={strokeWidth}
          fill="none"
        />
        {/* Progress arc */}
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          animatedProps={animatedProps}
          rotation={-90}
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>
      {/* Center content */}
      {children && (
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          {children}
        </View>
      )}
    </View>
  );
}
