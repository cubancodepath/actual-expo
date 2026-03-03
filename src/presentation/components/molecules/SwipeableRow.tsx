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

const SPRING_CONFIG = { damping: 20, stiffness: 200 };

interface SwipeableRowProps {
  children: React.ReactNode;
  onDelete: () => void;
  style?: ViewStyle;
}

export function SwipeableRow({ children, onDelete, style }: SwipeableRowProps) {
  const { colors } = useTheme();
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
      // Clamp: allow slight overswipe with rubber-band, no right overswipe
      translateX.value = Math.min(0, Math.max(-FULL_DELETE_THRESHOLD, next));
    })
    .onEnd((e) => {
      const current = translateX.value;

      // Full swipe → delete
      if (current < -FULL_DELETE_THRESHOLD * 0.7 || e.velocityX < -800) {
        triggerDelete();
        return;
      }

      // Past threshold → snap open
      if (current < -SWIPE_THRESHOLD) {
        snapToOpen();
      } else {
        snapToClose();
      }
    });

  const rowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const deleteButtonStyle = useAnimatedStyle(() => {
    const width = interpolate(
      -translateX.value,
      [0, DELETE_BUTTON_WIDTH, FULL_DELETE_THRESHOLD],
      [0, DELETE_BUTTON_WIDTH, FULL_DELETE_THRESHOLD],
    );
    const scale = interpolate(
      -translateX.value,
      [0, DELETE_BUTTON_WIDTH * 0.5, DELETE_BUTTON_WIDTH],
      [0.5, 0.8, 1],
      'clamp',
    );
    return {
      width,
      transform: [{ scale }],
    };
  });

  return (
    <View style={[styles.container, style]}>
      {/* Delete action behind the row */}
      <Animated.View
        style={[
          styles.deleteContainer,
          { backgroundColor: colors.negative },
          deleteButtonStyle,
        ]}
      >
        <Pressable
          style={styles.deleteButton}
          onPress={() => {
            translateX.value = withTiming(0, { duration: 200 });
            handleDelete();
          }}
        >
          <Ionicons name="trash-outline" size={22} color="#fff" />
        </Pressable>
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
  deleteContainer: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteButton: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  },
});
