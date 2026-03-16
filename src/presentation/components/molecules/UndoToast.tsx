import { useEffect, useCallback, useRef } from "react";
import { Pressable, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  useReducedMotion,
  Easing,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useUndoStore } from "../../../stores/undoStore";
import { useTheme } from "../../providers/ThemeProvider";
import { palette } from "../../../theme/colors";
import { Text } from "../atoms/Text";

const SPRING_CONFIG = { damping: 18, stiffness: 200, mass: 0.8 } as const;
const TRANSLATE_OUT = 80;
const AUTO_DISMISS_MS = 5000;

export function UndoToast() {
  const { t } = useTranslation();
  const { colors, spacing, borderRadius: br, shadows } = useTheme();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();

  const notification = useUndoStore((s) => s.notification);
  const canUndo = useUndoStore((s) => s.canUndo);
  const undo = useUndoStore((s) => s.undo);
  const clearNotification = useUndoStore((s) => s.clearNotification);

  const translateY = useSharedValue(TRANSLATE_OUT);
  const opacity = useSharedValue(0);

  const dismiss = useCallback(() => {
    if (reducedMotion) {
      opacity.value = withTiming(0, { duration: 0 }, () => scheduleOnRN(clearNotification));
      return;
    }
    translateY.value = withTiming(TRANSLATE_OUT, {
      duration: 220,
      easing: Easing.in(Easing.ease),
    });
    opacity.value = withTiming(0, { duration: 180 }, () => {
      scheduleOnRN(clearNotification);
    });
  }, [clearNotification, translateY, opacity, reducedMotion]);

  // Keep a ref so the timer always calls the latest dismiss
  const dismissRef = useRef(dismiss);
  dismissRef.current = dismiss;

  useEffect(() => {
    if (!notification) return;

    if (reducedMotion) {
      opacity.value = withTiming(1, { duration: 0 });
      translateY.value = 0;
    } else {
      translateY.value = withSpring(0, SPRING_CONFIG);
      opacity.value = withTiming(1, { duration: 180 });
    }

    const timer = setTimeout(() => dismissRef.current(), AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [notification?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  const pan = Gesture.Pan()
    .activeOffsetY([0, 10])
    .onUpdate((e) => {
      if (e.translationY > 0) {
        translateY.value = e.translationY;
        opacity.value = Math.max(0, 1 - e.translationY / 120);
      }
    })
    .onEnd((e) => {
      if (e.translationY > 30 || e.velocityY > 600) {
        scheduleOnRN(dismiss);
      } else {
        translateY.value = withSpring(0, SPRING_CONFIG);
        opacity.value = withTiming(1, { duration: 120 });
      }
    });

  const handleUndo = async () => {
    dismiss();
    await undo();
  };

  if (!notification) return null;

  const innerContent = (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        minHeight: 44,
        paddingHorizontal: 20,
        gap: spacing.md,
      }}
    >
      <Text
        variant="bodyLg"
        color={palette.white}
        numberOfLines={1}
        style={{ flex: 1 }}
        accessibilityElementsHidden
      >
        {notification.message}
      </Text>

      {canUndo && (
        <Pressable
          onPress={handleUndo}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`Undo: ${notification.message}`}
          style={({ pressed }) => [{ paddingVertical: spacing.sm, opacity: pressed ? 0.6 : 1 }]}
        >
          <Text variant="bodyLg" color={colors.primary} style={{ fontWeight: "600" }}>
            {t("undo")}
          </Text>
        </Pressable>
      )}
    </View>
  );

  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        style={[
          {
            position: "absolute",
            left: spacing.lg,
            right: spacing.lg,
            bottom: insets.bottom + spacing.lg,
            borderRadius: br.full,
            backgroundColor: colors.toastBackground,
            zIndex: 9999,
            ...shadows.modal,
          },
          animatedStyle,
        ]}
        accessibilityLiveRegion="polite"
        accessibilityLabel={notification.message}
        pointerEvents="box-none"
      >
        {innerContent}
      </Animated.View>
    </GestureDetector>
  );
}
