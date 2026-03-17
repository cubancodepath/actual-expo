import { Pressable, View } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { Icon } from "../atoms/Icon";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../providers/ThemeProvider";
import { useBudgetStore } from "../../../stores/budgetStore";
import { addMonths, formatMonth } from "../../../lib/date";

const SWIPE_THRESHOLD = 50;

export function MonthSelector() {
  const { i18n } = useTranslation();
  const { colors, spacing } = useTheme();
  const month = useBudgetStore((s) => s.month);
  const setMonth = useBudgetStore((s) => s.setMonth);

  const translateX = useSharedValue(0);
  const opacity = useSharedValue(1);

  function goToMonth(direction: -1 | 1) {
    const nextMonth = addMonths(month, direction);
    // Animate out
    translateX.value = withSequence(
      withTiming(direction * -60, { duration: 120 }),
      withTiming(direction * 60, { duration: 0 }),
      withTiming(0, { duration: 150 }),
    );
    opacity.value = withSequence(
      withTiming(0, { duration: 120 }),
      withTiming(0, { duration: 0 }),
      withTiming(1, { duration: 150 }),
    );
    // Update month after slide-out
    setTimeout(() => setMonth(nextMonth), 120);
  }

  const panGesture = Gesture.Pan()
    .activeOffsetX([-15, 15])
    .onUpdate((e) => {
      translateX.value = e.translationX * 0.5;
      opacity.value = 1 - Math.min(Math.abs(e.translationX) / 150, 0.4);
    })
    .onEnd((e) => {
      if (Math.abs(e.translationX) > SWIPE_THRESHOLD) {
        const direction = e.translationX > 0 ? -1 : 1;
        scheduleOnRN(goToMonth, direction as -1 | 1);
      } else {
        translateX.value = withTiming(0, { duration: 150 });
        opacity.value = withTiming(1, { duration: 150 });
      }
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
    opacity: opacity.value,
  }));

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.xs,
      }}
    >
      <Pressable onPress={() => goToMonth(-1)} hitSlop={12}>
        <Icon name="chevronBack" size={22} color={colors.headerText} />
      </Pressable>

      <GestureDetector gesture={panGesture}>
        <Animated.View style={animatedStyle}>
          <Animated.Text
            style={{
              color: colors.headerText,
              fontSize: 17,
              fontWeight: "600",
              minWidth: 140,
              textAlign: "center",
            }}
          >
            {formatMonth(month, i18n.language)}
          </Animated.Text>
        </Animated.View>
      </GestureDetector>

      <Pressable onPress={() => goToMonth(1)} hitSlop={12}>
        <Icon name="chevronForward" size={22} color={colors.headerText} />
      </Pressable>
    </View>
  );
}
