import { useEffect, useState } from "react";
import { Keyboard, Platform } from "react-native";

/**
 * How much room the keyboard is taking at the bottom of the screen, as a plain
 * number for padding a scroll view's content.
 *
 * For scroll views whose text field is NOT one of their own descendants — a
 * search field owned by the navigation bar, say. React Native's
 * `automaticallyAdjustKeyboardInsets` cannot be used there: it looks for a
 * React text input inside the scroll view to keep visible, and when it finds
 * none it falls through to a "keyboard opened for other reason" branch that
 * scrolls the content down by the keyboard's height
 * (`RCTScrollView.m`, `_keyboardWillChangeFrame`). With nothing to reveal, that
 * is pure damage — it pushes the first rows up under the header.
 *
 * Padding instead of an inset because padding only ever grows the content; it
 * can never move the scroll position.
 *
 * `useKeyboardHeight` is the animated sibling of this (a shared value, for
 * driving animations rather than layout).
 */
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    // `will` on iOS so the padding grows with the keyboard rather than after
    // it; Android only emits the `did` pair.
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const show = Keyboard.addListener(showEvent, (e) => setInset(e.endCoordinates.height));
    const hide = Keyboard.addListener(hideEvent, () => setInset(0));

    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return inset;
}
