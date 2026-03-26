import { Pressable, StyleSheet, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import Icon from "@/ui/atoms/Icon";
import type { IconName } from "@/ui/atoms/Icon";
import { triggerHaptic } from "@/lib/haptics";

// ─── Constants ────────────────────────────────────────────────────────────────

const ACTION_WIDTH = 80;
const SWIPE_THRESHOLD = 64;
const FULL_THRESHOLD = 260;
const CIRCLE_SIZE = 44;
const DELETE_COLOR = "#e53935";

const SPRING_CONFIG = { damping: 20, stiffness: 200 };

// ─── Types ────────────────────────────────────────────────────────────────────

type SwipeableRowProps = {
  children: React.ReactNode;
  onDelete: () => void;
  onSwipeRight?: () => void;
  swipeRightIcon?: IconName;
  swipeRightColor?: string;
};

// ─── Haptic helpers (called via runOnJS from worklet context) ─────────────────

function hapticLight() {
  triggerHaptic("light");
}

function hapticMedium() {
  triggerHaptic("medium");
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SwipeableRow({
  children,
  onDelete,
  onSwipeRight,
  swipeRightIcon = "Check",
  swipeRightColor = "#4caf50",
}: SwipeableRowProps) {
  const reducedMotion = useReducedMotion();
  const translateX = useSharedValue(0);
  const contextX = useSharedValue(0);

  const hasRightAction = onSwipeRight != null;

  // Threshold crossing guards — prevent repeated haptic fires in a single drag
  const passedDeleteOpen = useSharedValue(false);
  const passedDeleteFull = useSharedValue(false);
  const passedRightOpen = useSharedValue(false);
  const passedRightFull = useSharedValue(false);

  // ─── Snap helpers (worklets) ───────────────────────────────────────────────

  function snapToClose() {
    "worklet";
    translateX.value = reducedMotion ? 0 : withSpring(0, SPRING_CONFIG);
  }

  function snapToOpenLeft() {
    "worklet";
    translateX.value = reducedMotion ? -ACTION_WIDTH : withSpring(-ACTION_WIDTH, SPRING_CONFIG);
  }

  function snapToOpenRight() {
    "worklet";
    translateX.value = reducedMotion ? ACTION_WIDTH : withSpring(ACTION_WIDTH, SPRING_CONFIG);
  }

  function triggerDelete() {
    "worklet";
    if (reducedMotion) {
      translateX.value = 0;
      runOnJS(onDelete)();
      return;
    }
    translateX.value = withTiming(-FULL_THRESHOLD, { duration: 200 }, () => {
      translateX.value = withTiming(0, { duration: 150 });
      runOnJS(onDelete)();
    });
  }

  function triggerRight() {
    "worklet";
    if (!onSwipeRight) return;
    if (reducedMotion) {
      translateX.value = 0;
      runOnJS(onSwipeRight)();
      return;
    }
    translateX.value = withTiming(FULL_THRESHOLD, { duration: 200 }, () => {
      translateX.value = withTiming(0, { duration: 150 });
      runOnJS(onSwipeRight)();
    });
  }

  // ─── Pan gesture ──────────────────────────────────────────────────────────

  const pan = Gesture.Pan()
    .activeOffsetX([-25, 25])
    .failOffsetY([-15, 15])
    .onStart(() => {
      contextX.value = translateX.value;
      passedDeleteOpen.value = false;
      passedDeleteFull.value = false;
      passedRightOpen.value = false;
      passedRightFull.value = false;
    })
    .onUpdate((e) => {
      const next = contextX.value + e.translationX;
      const maxRight = hasRightAction ? FULL_THRESHOLD : 0;
      translateX.value = Math.max(-FULL_THRESHOLD, Math.min(maxRight, next));

      const tx = translateX.value;
      const fullTrigger = FULL_THRESHOLD * 0.7;

      // Left swipe (delete) haptics
      if (tx < 0) {
        const amount = -tx;

        if (amount >= SWIPE_THRESHOLD && !passedDeleteOpen.value) {
          passedDeleteOpen.value = true;
          runOnJS(hapticLight)();
        } else if (amount < SWIPE_THRESHOLD && passedDeleteOpen.value) {
          passedDeleteOpen.value = false;
          runOnJS(hapticLight)();
        }

        if (amount >= fullTrigger && !passedDeleteFull.value) {
          passedDeleteFull.value = true;
          runOnJS(hapticMedium)();
        } else if (amount < fullTrigger && passedDeleteFull.value) {
          passedDeleteFull.value = false;
          runOnJS(hapticLight)();
        }
      }

      // Right swipe haptics
      if (tx > 0 && hasRightAction) {
        const amount = tx;

        if (amount >= SWIPE_THRESHOLD && !passedRightOpen.value) {
          passedRightOpen.value = true;
          runOnJS(hapticLight)();
        } else if (amount < SWIPE_THRESHOLD && passedRightOpen.value) {
          passedRightOpen.value = false;
          runOnJS(hapticLight)();
        }

        if (amount >= fullTrigger && !passedRightFull.value) {
          passedRightFull.value = true;
          runOnJS(hapticMedium)();
        } else if (amount < fullTrigger && passedRightFull.value) {
          passedRightFull.value = false;
          runOnJS(hapticLight)();
        }
      }
    })
    .onEnd((e) => {
      const tx = translateX.value;
      const fullTrigger = FULL_THRESHOLD * 0.7;

      if (tx < 0) {
        if (tx < -fullTrigger || e.velocityX < -800) {
          triggerDelete();
          return;
        }
        if (tx < -SWIPE_THRESHOLD) {
          snapToOpenLeft();
        } else {
          snapToClose();
        }
        return;
      }

      if (tx > 0 && hasRightAction) {
        if (tx > fullTrigger || e.velocityX > 800) {
          triggerRight();
          return;
        }
        if (tx > SWIPE_THRESHOLD) {
          snapToOpenRight();
        } else {
          snapToClose();
        }
        return;
      }

      snapToClose();
    });

  // ─── Animated styles ──────────────────────────────────────────────────────

  const rowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  // Delete panel (right side — revealed by left swipe)
  const deleteAreaStyle = useAnimatedStyle(() => ({
    width: interpolate(
      -translateX.value,
      [0, ACTION_WIDTH, FULL_THRESHOLD],
      [0, ACTION_WIDTH, FULL_THRESHOLD],
    ),
  }));

  const deletePillStyle = useAnimatedStyle(() => {
    const amount = -translateX.value;
    return {
      width: interpolate(
        amount,
        [0, ACTION_WIDTH, FULL_THRESHOLD],
        [CIRCLE_SIZE, CIRCLE_SIZE, FULL_THRESHOLD - 16],
        "clamp",
      ),
      opacity: interpolate(amount, [0, ACTION_WIDTH * 0.3], [0, 1], "clamp"),
      transform: [
        {
          scale: interpolate(amount, [0, ACTION_WIDTH * 0.5, ACTION_WIDTH], [0.3, 0.7, 1], "clamp"),
        },
      ],
    };
  });

  const deleteIconStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: interpolate(
          -translateX.value,
          [ACTION_WIDTH, FULL_THRESHOLD],
          [0, -(FULL_THRESHOLD - CIRCLE_SIZE) / 2 + 16],
          "clamp",
        ),
      },
    ],
  }));

  // Right-action panel (left side — revealed by right swipe)
  const rightAreaStyle = useAnimatedStyle(() => ({
    width: interpolate(
      translateX.value,
      [0, ACTION_WIDTH, FULL_THRESHOLD],
      [0, ACTION_WIDTH, FULL_THRESHOLD],
    ),
  }));

  const rightPillStyle = useAnimatedStyle(() => {
    const amount = translateX.value;
    return {
      width: interpolate(
        amount,
        [0, ACTION_WIDTH, FULL_THRESHOLD],
        [CIRCLE_SIZE, CIRCLE_SIZE, FULL_THRESHOLD - 16],
        "clamp",
      ),
      opacity: interpolate(amount, [0, ACTION_WIDTH * 0.3], [0, 1], "clamp"),
      transform: [
        {
          scale: interpolate(amount, [0, ACTION_WIDTH * 0.5, ACTION_WIDTH], [0.3, 0.7, 1], "clamp"),
        },
      ],
    };
  });

  const rightIconStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: interpolate(
          translateX.value,
          [ACTION_WIDTH, FULL_THRESHOLD],
          [0, (FULL_THRESHOLD - CIRCLE_SIZE) / 2 - 16],
          "clamp",
        ),
      },
    ],
  }));

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      {/* Right-action button — sits on the left, revealed by rightward swipe */}
      {hasRightAction && (
        <Animated.View style={[styles.rightArea, rightAreaStyle]}>
          <Animated.View
            style={[styles.pill, rightPillStyle, { backgroundColor: swipeRightColor }]}
          >
            <Pressable
              style={styles.pillPressable}
              onPress={() => {
                translateX.value = withTiming(0, { duration: 200 });
                onSwipeRight?.();
              }}
              accessibilityRole="button"
            >
              <Animated.View style={rightIconStyle}>
                <Icon name={swipeRightIcon} size={20} color="#fff" strokeWidth={2.5} />
              </Animated.View>
            </Pressable>
          </Animated.View>
        </Animated.View>
      )}

      {/* Delete button — sits on the right, revealed by leftward swipe */}
      <Animated.View style={[styles.deleteArea, deleteAreaStyle]}>
        <Animated.View style={[styles.pill, deletePillStyle, { backgroundColor: DELETE_COLOR }]}>
          <Pressable
            style={styles.pillPressable}
            onPress={() => {
              translateX.value = withTiming(0, { duration: 200 });
              onDelete();
            }}
            accessibilityRole="button"
            accessibilityLabel="Delete"
          >
            <Animated.View style={deleteIconStyle}>
              <Icon name="Trash2" size={20} color="#fff" strokeWidth={2.5} />
            </Animated.View>
          </Pressable>
        </Animated.View>
      </Animated.View>

      {/* Swipeable row content */}
      <GestureDetector gesture={pan}>
        <Animated.View style={rowStyle}>{children}</Animated.View>
      </GestureDetector>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    overflow: "hidden",
  },
  deleteArea: {
    ...StyleSheet.absoluteFillObject,
    left: undefined,
    justifyContent: "center",
    alignItems: "center",
  },
  rightArea: {
    ...StyleSheet.absoluteFillObject,
    right: undefined,
    justifyContent: "center",
    alignItems: "center",
  },
  pill: {
    height: CIRCLE_SIZE,
    borderRadius: CIRCLE_SIZE / 2,
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  pillPressable: {
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
  },
});
