import { useEffect, useRef } from "react";
import { Keyboard, Platform } from "react-native";

/**
 * Fallback for reliable blur on keyboards without a Return key (number-pad, decimal-pad).
 * Catches keyboard dismissal via scroll, tab switch, Keyboard.dismiss(), etc.
 * even when the zero-size hidden TextInput doesn't fire onBlur reliably.
 */
export function useKeyboardBlur(focused: boolean, onBlur: () => void) {
  const focusedRef = useRef(false);
  focusedRef.current = focused;
  const onBlurRef = useRef(onBlur);
  onBlurRef.current = onBlur;

  useEffect(() => {
    const event = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const sub = Keyboard.addListener(event, () => {
      if (focusedRef.current) onBlurRef.current();
    });
    return () => sub.remove();
  }, []);
}
