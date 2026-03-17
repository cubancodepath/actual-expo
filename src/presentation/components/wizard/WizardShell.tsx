import { useCallback, useRef, useState } from "react";
import { Dimensions, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useReducedMotion } from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { scheduleOnRN } from "react-native-worklets";
import { EaseView } from "react-native-ease";
import { useTheme } from "../../providers/ThemeProvider";
import { WizardProgressBar } from "./WizardProgressBar";
import type { ReactNode } from "react";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const PARALLAX = 0.28;
const SPRING = { type: "spring" as const, damping: 22, stiffness: 240, mass: 1 };

export type WizardDirection = "forward" | "backward";

// ---------------------------------------------------------------------------
// Hook: useWizardTransition
// ---------------------------------------------------------------------------

export function useWizardTransition() {
  const reducedMotion = useReducedMotion();
  const animating = useRef(false);

  // Positions: incoming and outgoing translateX targets
  const [inTarget, setInTarget] = useState(0);
  const [outTarget, setOutTarget] = useState(0);
  // Whether the panels should animate or snap
  const [shouldAnimate, setShouldAnimate] = useState(false);
  const onDoneRef = useRef<(() => void) | null>(null);

  function trigger(direction: WizardDirection, onDone: () => void) {
    if (animating.current) return false;
    animating.current = true;
    onDoneRef.current = onDone;

    if (reducedMotion) {
      animating.current = false;
      onDone();
      return true;
    }

    // Set starting positions (no animation yet)
    setShouldAnimate(false);
    setInTarget(direction === "forward" ? SCREEN_WIDTH : -SCREEN_WIDTH * PARALLAX);
    setOutTarget(0);

    // On next frame, animate to final positions
    requestAnimationFrame(() => {
      setShouldAnimate(true);
      setInTarget(0);
      setOutTarget(direction === "forward" ? -SCREEN_WIDTH * PARALLAX : SCREEN_WIDTH);
    });

    return true;
  }

  function handleTransitionEnd() {
    if (!animating.current) return;
    animating.current = false;
    const cb = onDoneRef.current;
    onDoneRef.current = null;
    cb?.();
  }

  return {
    trigger,
    inTarget,
    outTarget,
    shouldAnimate,
    handleTransitionEnd,
    isAnimating: () => animating.current,
  };
}

// ---------------------------------------------------------------------------
// Component: WizardShell
// ---------------------------------------------------------------------------

type WizardShellProps = {
  stepNumber: number;
  totalSteps: number;
  onClose: () => void;
  onBack: (() => void) | null;
  hideProgress?: boolean;
  // Transition state from useWizardTransition
  inTarget: number;
  outTarget: number;
  shouldAnimate: boolean;
  onTransitionEnd: () => void;
  // Content
  prevContent: ReactNode;
  children: ReactNode;
};

export function WizardShell({
  stepNumber,
  totalSteps,
  onClose,
  onBack,
  hideProgress,
  inTarget,
  outTarget,
  shouldAnimate,
  onTransitionEnd,
  prevContent,
  children,
}: WizardShellProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();

  const transition = shouldAnimate && !reducedMotion ? SPRING : { type: "none" as const };

  // Swipe right to go back
  function triggerBack() {
    "worklet";
    if (onBack) scheduleOnRN(onBack);
  }

  const swipeBack = Gesture.Pan()
    .activeOffsetX(40)
    .failOffsetY([-20, 20])
    .enabled(onBack != null)
    .onEnd((e) => {
      "worklet";
      if (e.translationX > 80) triggerBack();
    });

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.pageBackground }}>
      <View style={{ paddingTop: insets.top + 8 }}>
        {!hideProgress && <WizardProgressBar step={stepNumber} total={totalSteps} />}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingHorizontal: theme.spacing.md,
            paddingVertical: theme.spacing.xs,
            minHeight: 44,
          }}
        >
          {onBack ? (
            <Pressable onPress={onBack} hitSlop={8} style={{ padding: 8 }}>
              <Ionicons name="chevron-back" size={24} color={theme.colors.textPrimary} />
            </Pressable>
          ) : (
            <View style={{ width: 40 }} />
          )}
          <Pressable onPress={onClose} hitSlop={8} style={{ padding: 8 }}>
            <Ionicons name="close" size={24} color={theme.colors.textSecondary} />
          </Pressable>
        </View>
      </View>

      <GestureDetector gesture={swipeBack}>
      <View style={{ flex: 1, overflow: "hidden" }}>
        {/* Outgoing panel */}
        {prevContent != null && (
          <EaseView
            animate={{ translateX: outTarget }}
            transition={transition}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: theme.colors.pageBackground,
            }}
            pointerEvents="none"
          >
            {prevContent}
          </EaseView>
        )}
        {/* Incoming panel */}
        <EaseView
          animate={{ translateX: inTarget }}
          transition={transition}
          onTransitionEnd={({ finished }) => {
            if (finished) onTransitionEnd();
          }}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: theme.colors.pageBackground,
          }}
        >
          {children}
        </EaseView>
      </View>
      </GestureDetector>
    </View>
  );
}
