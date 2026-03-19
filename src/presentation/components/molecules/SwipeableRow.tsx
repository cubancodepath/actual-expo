import { Pressable, StyleSheet, View, type ViewStyle } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { Icon } from "../atoms/Icon";
import type { IconName } from "../atoms/iconRegistry";
import * as Haptics from "expo-haptics";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../providers/ThemeProvider";

const ACTION_WIDTH = 80;
const SWIPE_THRESHOLD = ACTION_WIDTH * 0.8;
const FULL_THRESHOLD = 260;
const CIRCLE_SIZE = 44;

const SPRING_CONFIG = { damping: 20, stiffness: 200 };

interface SwipeableRowProps {
  children: React.ReactNode;
  onDelete: () => void;
  /** Optional right-swipe action (e.g., clear/unclear) */
  onSwipeRight?: () => void;
  swipeRightIcon?: IconName;
  swipeRightColor?: string;
  isFirst?: boolean;
  isLast?: boolean;
  style?: ViewStyle;
}

function lightHaptic() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}

function mediumHaptic() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
}

export function SwipeableRow({
  children,
  onDelete,
  onSwipeRight,
  swipeRightIcon = "checkmarkCircle",
  swipeRightColor,
  isFirst,
  isLast,
  style,
}: SwipeableRowProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const reducedMotion = useReducedMotion();
  const translateX = useSharedValue(0);
  const contextX = useSharedValue(0);

  // Left-swipe (delete) thresholds
  const passedDeleteThreshold = useSharedValue(false);
  const passedDeleteOpenThreshold = useSharedValue(false);

  // Right-swipe thresholds
  const passedRightThreshold = useSharedValue(false);
  const passedRightOpenThreshold = useSharedValue(false);

  const hasRightAction = onSwipeRight != null;
  const rightColor = swipeRightColor ?? colors.positiveFill;

  function handleDelete() {
    onDelete();
  }

  function handleSwipeRight() {
    onSwipeRight?.();
  }

  function snapToClose() {
    "worklet";
    translateX.value = reducedMotion ? 0 : withSpring(0, SPRING_CONFIG);
  }

  // Left-swipe helpers
  function snapToOpenLeft() {
    "worklet";
    translateX.value = reducedMotion ? -ACTION_WIDTH : withSpring(-ACTION_WIDTH, SPRING_CONFIG);
  }

  function triggerDelete() {
    "worklet";
    if (reducedMotion) {
      translateX.value = 0;
      scheduleOnRN(handleDelete);
      return;
    }
    translateX.value = withTiming(-FULL_THRESHOLD, { duration: 200 }, () => {
      translateX.value = withTiming(0, { duration: 150 });
      scheduleOnRN(handleDelete);
    });
  }

  // Right-swipe helpers
  function snapToOpenRight() {
    "worklet";
    translateX.value = reducedMotion ? ACTION_WIDTH : withSpring(ACTION_WIDTH, SPRING_CONFIG);
  }

  function triggerRight() {
    "worklet";
    if (reducedMotion) {
      translateX.value = 0;
      scheduleOnRN(handleSwipeRight);
      return;
    }
    translateX.value = withTiming(FULL_THRESHOLD, { duration: 200 }, () => {
      translateX.value = withTiming(0, { duration: 150 });
      scheduleOnRN(handleSwipeRight);
    });
  }

  const pan = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .failOffsetY([-15, 15])
    .onStart(() => {
      contextX.value = translateX.value;
      passedDeleteThreshold.value = false;
      passedDeleteOpenThreshold.value = false;
      passedRightThreshold.value = false;
      passedRightOpenThreshold.value = false;
    })
    .onUpdate((e) => {
      const next = contextX.value + e.translationX;
      const maxRight = hasRightAction ? FULL_THRESHOLD : 0;
      translateX.value = Math.max(-FULL_THRESHOLD, Math.min(maxRight, next));

      const tx = translateX.value;

      // --- Left-swipe (delete) haptics ---
      if (tx < 0) {
        const leftAmount = -tx;
        const fullThreshold = FULL_THRESHOLD * 0.7;
        if (leftAmount >= fullThreshold && !passedDeleteThreshold.value) {
          passedDeleteThreshold.value = true;
          scheduleOnRN(mediumHaptic);
        } else if (leftAmount < fullThreshold && passedDeleteThreshold.value) {
          passedDeleteThreshold.value = false;
          scheduleOnRN(lightHaptic);
        }
        if (leftAmount >= SWIPE_THRESHOLD && !passedDeleteOpenThreshold.value) {
          passedDeleteOpenThreshold.value = true;
          scheduleOnRN(lightHaptic);
        }
      }

      // --- Right-swipe haptics ---
      if (tx > 0 && hasRightAction) {
        const rightAmount = tx;
        const fullThreshold = FULL_THRESHOLD * 0.7;
        if (rightAmount >= fullThreshold && !passedRightThreshold.value) {
          passedRightThreshold.value = true;
          scheduleOnRN(mediumHaptic);
        } else if (rightAmount < fullThreshold && passedRightThreshold.value) {
          passedRightThreshold.value = false;
          scheduleOnRN(lightHaptic);
        }
        if (rightAmount >= SWIPE_THRESHOLD && !passedRightOpenThreshold.value) {
          passedRightOpenThreshold.value = true;
          scheduleOnRN(lightHaptic);
        }
      }
    })
    .onEnd((e) => {
      const tx = translateX.value;

      // Left-swipe end
      if (tx < 0) {
        if (tx < -FULL_THRESHOLD * 0.7 || e.velocityX < -800) {
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

      // Right-swipe end
      if (tx > 0 && hasRightAction) {
        if (tx > FULL_THRESHOLD * 0.7 || e.velocityX > 800) {
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

  // ---- Animated styles ----

  const rowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  // --- Delete (right side) ---

  const deleteAreaStyle = useAnimatedStyle(() => {
    const width = interpolate(
      -translateX.value,
      [0, ACTION_WIDTH, FULL_THRESHOLD],
      [0, ACTION_WIDTH, FULL_THRESHOLD],
    );
    return { width };
  });

  const deletePillStyle = useAnimatedStyle(() => {
    const swipeAmount = -translateX.value;
    const pillWidth = interpolate(
      swipeAmount,
      [0, ACTION_WIDTH, FULL_THRESHOLD],
      [CIRCLE_SIZE, CIRCLE_SIZE, FULL_THRESHOLD - 16],
      "clamp",
    );
    const scale = interpolate(
      swipeAmount,
      [0, ACTION_WIDTH * 0.5, ACTION_WIDTH],
      [0.3, 0.7, 1],
      "clamp",
    );
    const opacity = interpolate(swipeAmount, [0, ACTION_WIDTH * 0.3], [0, 1], "clamp");
    return { width: pillWidth, transform: [{ scale }], opacity };
  });

  const deleteIconStyle = useAnimatedStyle(() => {
    const swipeAmount = -translateX.value;
    const shift = interpolate(
      swipeAmount,
      [ACTION_WIDTH, FULL_THRESHOLD],
      [0, -(FULL_THRESHOLD - CIRCLE_SIZE) / 2 + 16],
      "clamp",
    );
    return { transform: [{ translateX: shift }] };
  });

  // --- Right action (left side) ---

  const rightAreaStyle = useAnimatedStyle(() => {
    const width = interpolate(
      translateX.value,
      [0, ACTION_WIDTH, FULL_THRESHOLD],
      [0, ACTION_WIDTH, FULL_THRESHOLD],
    );
    return { width };
  });

  const rightPillStyle = useAnimatedStyle(() => {
    const swipeAmount = translateX.value;
    const pillWidth = interpolate(
      swipeAmount,
      [0, ACTION_WIDTH, FULL_THRESHOLD],
      [CIRCLE_SIZE, CIRCLE_SIZE, FULL_THRESHOLD - 16],
      "clamp",
    );
    const scale = interpolate(
      swipeAmount,
      [0, ACTION_WIDTH * 0.5, ACTION_WIDTH],
      [0.3, 0.7, 1],
      "clamp",
    );
    const opacity = interpolate(swipeAmount, [0, ACTION_WIDTH * 0.3], [0, 1], "clamp");
    return { width: pillWidth, transform: [{ scale }], opacity };
  });

  const rightIconStyle = useAnimatedStyle(() => {
    const swipeAmount = translateX.value;
    const shift = interpolate(
      swipeAmount,
      [ACTION_WIDTH, FULL_THRESHOLD],
      [0, (FULL_THRESHOLD - CIRCLE_SIZE) / 2 - 16],
      "clamp",
    );
    return { transform: [{ translateX: shift }] };
  });

  return (
    <View style={[styles.container, style]}>
      {/* Right-swipe action behind the row (left side) */}
      {hasRightAction && (
        <Animated.View style={[styles.rightArea, rightAreaStyle]}>
          <Animated.View style={rightPillStyle}>
            <Pressable
              style={[styles.pill, { backgroundColor: rightColor }]}
              onPress={() => {
                translateX.value = withTiming(0, { duration: 200 });
                handleSwipeRight();
              }}
              accessibilityRole="button"
            >
              <Animated.View style={rightIconStyle}>
                <Icon name={swipeRightIcon} size={20} color="#fff" />
              </Animated.View>
            </Pressable>
          </Animated.View>
        </Animated.View>
      )}

      {/* Delete action behind the row (right side) */}
      <Animated.View style={[styles.deleteArea, deleteAreaStyle]}>
        <Animated.View style={deletePillStyle}>
          <Pressable
            style={[styles.pill, { backgroundColor: colors.negativeFill }]}
            onPress={() => {
              translateX.value = withTiming(0, { duration: 200 });
              handleDelete();
            }}
            accessibilityRole="button"
            accessibilityLabel={t("a11y.delete")}
          >
            <Animated.View style={deleteIconStyle}>
              <Icon name="trashOutline" size={20} color="#fff" />
            </Animated.View>
          </Pressable>
        </Animated.View>
      </Animated.View>

      {/* Swipeable content */}
      <GestureDetector gesture={pan}>
        <Animated.View style={rowStyle}>{children}</Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: "hidden",
  },
  deleteArea: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
  },
  rightArea: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
  },
  pill: {
    height: CIRCLE_SIZE,
    borderRadius: CIRCLE_SIZE / 2,
    justifyContent: "center",
    alignItems: "center",
  },
});
