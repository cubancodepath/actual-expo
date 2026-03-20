import { useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { EaseView } from "react-native-ease";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { Icon } from "../atoms/Icon";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../providers/ThemeProvider";
import { useBudgetUIStore } from "../../../stores/budgetUIStore";
import { addMonths, formatMonth } from "../../../lib/date";

const SWIPE_THRESHOLD = 50;
const DURATION = 120;

export function MonthSelector() {
  const { i18n } = useTranslation();
  const { colors, spacing } = useTheme();
  const month = useBudgetUIStore((s) => s.month);
  const setMonth = useBudgetUIStore((s) => s.setMonth);

  // Key increments to force remount of EaseView with fresh initialAnimate
  const [animKey, setAnimKey] = useState(0);
  const [direction, setDirection] = useState<-1 | 1>(1);
  const [animating, setAnimating] = useState(false);

  function goToMonth(dir: -1 | 1) {
    if (animating) return;
    setAnimating(true);
    setDirection(dir);
    const nextMonth = addMonths(month, dir);
    // Set the new month — React renders new text immediately but EaseView
    // starts from initialAnimate (invisible, offset) and animates to visible
    setMonth(nextMonth);
    setAnimKey((k) => k + 1);
  }

  // Swipe gesture (Reanimated for smooth finger-follow during drag)
  const gestureTranslateX = useSharedValue(0);
  const gestureOpacity = useSharedValue(1);

  const panGesture = Gesture.Pan()
    .activeOffsetX([-15, 15])
    .onUpdate((e) => {
      if (animating) return;
      gestureTranslateX.value = e.translationX * 0.5;
      gestureOpacity.value = 1 - Math.min(Math.abs(e.translationX) / 150, 0.4);
    })
    .onEnd((e) => {
      if (animating) return;
      if (Math.abs(e.translationX) > SWIPE_THRESHOLD) {
        const dir: -1 | 1 = e.translationX > 0 ? -1 : 1;
        gestureTranslateX.value = withTiming(0, { duration: 0 });
        gestureOpacity.value = withTiming(1, { duration: 0 });
        runOnJS(goToMonth)(dir);
      } else {
        gestureTranslateX.value = withTiming(0, { duration: 150 });
        gestureOpacity.value = withTiming(1, { duration: 150 });
      }
    });

  const gestureStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: gestureTranslateX.value }],
    opacity: gestureOpacity.value,
  }));

  const textStyle = {
    color: colors.headerText,
    fontSize: 17,
    fontWeight: "600" as const,
    minWidth: 140,
    textAlign: "center" as const,
  };

  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs }}>
      <Pressable onPress={() => goToMonth(-1)} hitSlop={12}>
        <Icon name="chevronBack" size={22} color={colors.headerText} />
      </Pressable>

      <GestureDetector gesture={panGesture}>
        <Animated.View style={gestureStyle}>
          <EaseView
            key={animKey}
            initialAnimate={animKey > 0 ? { opacity: 0, translateX: direction * 40 } : undefined}
            animate={{ opacity: 1, translateX: 0 }}
            transition={{ type: "timing", duration: DURATION, easing: "easeOut" }}
            onTransitionEnd={({ finished }) => {
              if (finished) setAnimating(false);
            }}
          >
            <Text style={textStyle}>{formatMonth(month, i18n.language)}</Text>
          </EaseView>
        </Animated.View>
      </GestureDetector>

      <Pressable onPress={() => goToMonth(1)} hitSlop={12}>
        <Icon name="chevronForward" size={22} color={colors.headerText} />
      </Pressable>
    </View>
  );
}
