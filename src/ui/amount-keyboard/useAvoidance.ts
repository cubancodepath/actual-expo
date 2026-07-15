import { useCallback, useMemo, useRef } from "react";
import { useWindowDimensions, type ScrollView } from "react-native";
import type { NativeScrollEvent, NativeSyntheticEvent } from "react-native";

/** Fallback panel height until the keyboard reports its measured one. */
const KEYBOARD_HEIGHT_FALLBACK = 340;
/** Breathing room between the active row and the keyboard's top edge. */
const ROW_MARGIN = 72;

interface AvoidanceOptions {
  /** Content bottom padding while idle. */
  basePadding: number;
  /** Content bottom padding while the keyboard is open (must fit the panel). */
  editingPadding: number;
  /** Whether the keyboard is currently open. */
  editing: boolean;
}

/**
 * Manual keyboard avoidance for lists edited with the in-app AmountKeyboard —
 * there is no system keyboard, so `KeyboardAvoidingView` can't help. Replicates
 * its behaviour: when a row near the bottom is tapped, the list scrolls so the
 * row sits above the keyboard.
 *
 * The first scroll is deferred to `onContentSizeChange`: scrolling immediately
 * would be clamped against the pre-edit content size (the editing padding lands
 * a frame later).
 *
 * ```tsx
 * const { scrollRef, scrollProps, bottomPadding, scrollIntoView, onKeyboardHeightChange } =
 *   useAmountKeyboardAvoidance({ basePadding: 140, editingPadding: 420, editing: isEditing });
 *
 * <Animated.ScrollView ref={scrollRef} {...scrollProps}
 *   contentContainerStyle={{ paddingBottom: bottomPadding }}>…</Animated.ScrollView>
 * // on row press: scrollIntoView(e.nativeEvent.pageY)
 * // on the panel:  <AmountKeyboard.Panel onHeightChange={onKeyboardHeightChange}>
 * ```
 */
export function useAmountKeyboardAvoidance({
  basePadding,
  editingPadding,
  editing,
}: AvoidanceOptions) {
  const { height: windowHeight } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);
  const scrollYRef = useRef(0);
  const keyboardHeightRef = useRef(KEYBOARD_HEIGHT_FALLBACK);
  // Scroll target waiting for the editing padding to be applied.
  const pendingScrollYRef = useRef<number | null>(null);
  const editingRef = useRef(editing);
  editingRef.current = editing;

  const scrollIntoView = useCallback(
    (pageY: number) => {
      const keyboardTop = windowHeight - keyboardHeightRef.current;
      if (pageY <= keyboardTop - ROW_MARGIN) return;
      const target = scrollYRef.current + (pageY - (keyboardTop - ROW_MARGIN));
      if (editingRef.current) {
        // Padding already applied (e.g. switching rows) — scroll right away.
        scrollRef.current?.scrollTo({ y: target, animated: true });
      } else {
        pendingScrollYRef.current = target;
      }
    },
    [windowHeight],
  );

  const onKeyboardHeightChange = useCallback((height: number) => {
    keyboardHeightRef.current = height;
  }, []);

  // For scrolls whose host owns `onScroll` (e.g. ScreenHeader.Body drives the
  // header blur): feed the offset directly instead of via `scrollProps.onScroll`.
  const setScrollY = useCallback((y: number) => {
    scrollYRef.current = y;
  }, []);

  const scrollProps = useMemo(
    () => ({
      onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => {
        scrollYRef.current = e.nativeEvent.contentOffset.y;
      },
      onContentSizeChange: () => {
        if (pendingScrollYRef.current != null) {
          scrollRef.current?.scrollTo({ y: pendingScrollYRef.current, animated: true });
          pendingScrollYRef.current = null;
        }
      },
      scrollEventThrottle: 16,
    }),
    [],
  );

  return {
    scrollRef,
    scrollProps,
    setScrollY,
    bottomPadding: editing ? editingPadding : basePadding,
    scrollIntoView,
    onKeyboardHeightChange,
  };
}
