import { useEffect, useState } from "react";
import { Keyboard, Platform } from "react-native";
import { useSharedValue, withTiming } from "react-native-reanimated";

/**
 * Tracks the keyboard height as both a shared value (for animations)
 * and a boolean state (for conditional rendering).
 */
export function useKeyboardHeight() {
  const height = useSharedValue(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const showSub = Keyboard.addListener(showEvent, (e) => {
      setVisible(true);
      height.value = withTiming(e.endCoordinates.height, {
        duration: e.duration ?? 250,
      });
    });

    const hideSub = Keyboard.addListener(hideEvent, (e) => {
      setVisible(false);
      height.value = withTiming(0, {
        duration: (e as any).duration ?? 250,
      });
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  return { height, visible };
}
