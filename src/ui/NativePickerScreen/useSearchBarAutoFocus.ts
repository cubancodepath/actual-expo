import { useCallback, useRef, type RefObject } from "react";
import { useFocusEffect } from "expo-router";
import type { SearchBarCommands } from "react-native-screens";

/** Close enough to a push transition (~400ms) plus a slow first frame. */
const RETRY_MS = 120;
const MAX_ATTEMPTS = 12;

/**
 * Opens a screen with its native search field already focused.
 *
 * Imperative because `SearchBar`'s `autoFocus` prop is declared in its types and
 * its Fabric spec but is only implemented on Android — there is no reference to
 * it anywhere in `react-native-screens/ios`.
 *
 * Retried rather than fired once because the native `focus()` is a bare
 * `[searchBar becomeFirstResponder]` (`RNSSearchBar.mm`), which returns NO —
 * silently, no throw, no log — while the bar is not yet in a window. That is
 * the whole push transition, so any single delay is a race we lose. There is no
 * success signal from native either, so the bar's own `onFocus` is the only
 * proof it landed: feed it back through {@link onFocus} and the retries stop.
 *
 * On navigation focus rather than on mount, so a screen that stays mounted
 * while something is pushed on top of it focuses again on the way back.
 */
export function useSearchBarAutoFocus(
  searchBarRef: RefObject<SearchBarCommands | null>,
  enabled = true,
) {
  const focused = useRef(false);

  useFocusEffect(
    useCallback(() => {
      if (!enabled) return;

      let attempts = 0;
      const timer = setInterval(() => {
        if (focused.current || attempts >= MAX_ATTEMPTS) {
          clearInterval(timer);
          return;
        }
        attempts += 1;
        searchBarRef.current?.focus();
      }, RETRY_MS);

      return () => clearInterval(timer);
    }, [searchBarRef, enabled]),
  );

  /** Wire to the bar's `onFocus`/`onBlur` so the retry loop knows where it is. */
  const onFocus = useCallback(() => {
    focused.current = true;
  }, []);
  const onBlur = useCallback(() => {
    focused.current = false;
  }, []);

  return { onFocus, onBlur };
}
