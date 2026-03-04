import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../providers/ThemeProvider';

const DELETE_BUTTON_WIDTH = 80;
const SWIPE_THRESHOLD = DELETE_BUTTON_WIDTH * 0.4;
const FULL_DELETE_THRESHOLD = 200;
const CIRCLE_SIZE = 44;

const SPRING_CONFIG = { damping: 20, stiffness: 200 };

interface SwipeableRowProps {
  children: React.ReactNode;
  onDelete: () => void;
  isFirst?: boolean;
  isLast?: boolean;
  style?: ViewStyle;
}

export function SwipeableRow({ children, onDelete, isFirst, isLast, style }: SwipeableRowProps) {
  const { colors, borderRadius: br } = useTheme();
  const translateX = useSharedValue(0);
  const contextX = useSharedValue(0);

  function handleDelete() {
    onDelete();
  }

  function snapToClose() {
    'worklet';
    translateX.value = withSpring(0, SPRING_CONFIG);
  }

  function snapToOpen() {
    'worklet';
    translateX.value = withSpring(-DELETE_BUTTON_WIDTH, SPRING_CONFIG);
  }

  function triggerDelete() {
    'worklet';
    translateX.value = withTiming(-FULL_DELETE_THRESHOLD, { duration: 200 }, () => {
      translateX.value = withTiming(0, { duration: 150 });
      runOnJS(handleDelete)();
    });
  }

  const pan = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .failOffsetY([-15, 15])
    .onStart(() => {
      contextX.value = translateX.value;
    })
    .onUpdate((e) => {
      const next = contextX.value + e.translationX;
      translateX.value = Math.min(0, Math.max(-FULL_DELETE_THRESHOLD, next));
    })
    .onEnd((e) => {
      const current = translateX.value;

      if (current < -FULL_DELETE_THRESHOLD * 0.7 || e.velocityX < -800) {
        triggerDelete();
        return;
      }

      if (current < -SWIPE_THRESHOLD) {
        snapToOpen();
      } else {
        snapToClose();
      }
    });

  const rowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const deleteAreaStyle = useAnimatedStyle(() => {
    const width = interpolate(
      -translateX.value,
      [0, DELETE_BUTTON_WIDTH, FULL_DELETE_THRESHOLD],
      [0, DELETE_BUTTON_WIDTH, FULL_DELETE_THRESHOLD],
    );
    return { width };
  });

  // Circle stretches into a pill on full swipe
  const pillStyle = useAnimatedStyle(() => {
    const swipeAmount = -translateX.value;
    const pillWidth = interpolate(
      swipeAmount,
      [0, DELETE_BUTTON_WIDTH, FULL_DELETE_THRESHOLD],
      [CIRCLE_SIZE, CIRCLE_SIZE, FULL_DELETE_THRESHOLD - 16],
      'clamp',
    );
    const scale = interpolate(
      swipeAmount,
      [0, DELETE_BUTTON_WIDTH * 0.5, DELETE_BUTTON_WIDTH],
      [0.3, 0.7, 1],
      'clamp',
    );
    const opacity = interpolate(
      swipeAmount,
      [0, DELETE_BUTTON_WIDTH * 0.3],
      [0, 1],
      'clamp',
    );
    return {
      width: pillWidth,
      transform: [{ scale }],
      opacity,
    };
  });

  const containerRadius = {
    borderTopLeftRadius: isFirst ? br.lg : 0,
    borderTopRightRadius: isFirst ? br.lg : 0,
    borderBottomLeftRadius: isLast ? br.lg : 0,
    borderBottomRightRadius: isLast ? br.lg : 0,
  };

  return (
    <View style={[styles.container, containerRadius, style]}>
      {/* Delete action behind the row */}
      <Animated.View style={[styles.deleteArea, deleteAreaStyle]}>
        <Animated.View style={pillStyle}>
          <Pressable
            style={[styles.deletePill, { backgroundColor: colors.negative }]}
            onPress={() => {
              translateX.value = withTiming(0, { duration: 200 });
              handleDelete();
            }}
          >
            <Ionicons name="trash-outline" size={20} color="#fff" />
          </Pressable>
        </Animated.View>
      </Animated.View>

      {/* Swipeable content */}
      <GestureDetector gesture={pan}>
        <Animated.View style={rowStyle}>
          {children}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
  deleteArea: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deletePill: {
    height: CIRCLE_SIZE,
    borderRadius: CIRCLE_SIZE / 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
