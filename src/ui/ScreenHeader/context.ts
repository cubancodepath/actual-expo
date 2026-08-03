import { createContext, use, useCallback, useEffect } from "react";
import type { NativeScrollEvent, NativeSyntheticEvent } from "react-native";
import { useAnimatedScrollHandler, type SharedValue } from "react-native-reanimated";

/**
 * Shared state for the scroll-aware header scaffold. Lifted into
 * {@link ScreenHeaderScrollArea} so the (sibling) scrollable and the floating
 * header can talk without prop drilling: the scrollable writes `scrollOffset`
 * and reads `headerHeight` for its top padding; the header reads `scrollOffset`
 * to drive its blur and publishes its measured height via `setHeaderHeight`.
 */
export type ScreenHeaderScrollValue = {
  scrollOffset: SharedValue<number>;
  headerHeight: number;
  setHeaderHeight: (height: number) => void;
};

export const ScreenHeaderScrollContext = createContext<ScreenHeaderScrollValue | null>(null);

export function useScreenHeaderScrollContext(): ScreenHeaderScrollValue {
  const ctx = use(ScreenHeaderScrollContext);
  if (!ctx) {
    throw new Error(
      "ScreenHeader.Body / ScreenHeader.Floating must be used within <ScreenHeader.ScrollArea>",
    );
  }
  return ctx;
}

/**
 * Escape hatch for bring-your-own lists (LegendList, FlatList — anything that
 * isn't an `Animated.ScrollView`). Spread the returned `onScroll` onto the list
 * and use `contentPaddingTop` for its top inset; the header blur then tracks it
 * the same way `ScreenHeader.Body` does.
 */
export function useScreenHeaderScroll() {
  const { scrollOffset, headerHeight } = useScreenHeaderScrollContext();
  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      scrollOffset.value = e.nativeEvent.contentOffset.y;
    },
    [scrollOffset],
  );
  return { onScroll, contentPaddingTop: headerHeight };
}

/**
 * The same escape hatch as {@link useScreenHeaderScroll}, for lists that demand a
 * Reanimated scroll handler instead of a JS callback — `ReorderableList` is one:
 * it drives autoscroll from the offset on the UI thread, so it types `onScroll`
 * as `useAnimatedScrollHandler`'s return and refuses anything else.
 */
export function useScreenHeaderAnimatedScroll() {
  const { scrollOffset, headerHeight } = useScreenHeaderScrollContext();
  const onScroll = useAnimatedScrollHandler((e) => {
    scrollOffset.value = e.contentOffset.y;
  });

  // Unlike ScreenHeader.Body, a bring-your-own list can be swapped for another
  // one under the same header (a segmented control switching lists). The
  // offset lives in the ScrollArea above them, so without this the new list —
  // which mounts at the top — would inherit the old one's scroll position and
  // wear a blur it hasn't earned.
  useEffect(() => {
    scrollOffset.value = 0;
  }, [scrollOffset]);

  return { onScroll, contentPaddingTop: headerHeight };
}
