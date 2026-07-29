import { useCallback, useEffect, useRef } from "react";
import type { NativeSyntheticEvent, TextInputFocusEventData } from "react-native";
import type { SearchBarCommands } from "react-native-screens";

/**
 * Bridges the native search bar — which is uncontrolled, `SearchBarProps` has
 * no `value`, only an imperative `setText` — to the controlled
 * `(query, onQueryChange)` API the picker views are written against.
 *
 * Both returned values are stable across renders, so the caller can memoise its
 * header options without them changing identity. That matters: expo-router's
 * `<Stack.Screen>` calls `setOptions` whenever the options object changes, and
 * a fresh `headerSearchBarOptions` rebuilds the native search bar — mid-typing
 * that drops the keyboard.
 */
export function useSearchBridge(query: string, onQueryChange: (query: string) => void) {
  const searchBarRef = useRef<SearchBarCommands>(null);

  const onQueryChangeRef = useRef(onQueryChange);
  onQueryChangeRef.current = onQueryChange;

  // What the native bar last reported, or what we last wrote into it. Without
  // it we would push the text back on every keystroke and fight the cursor.
  const lastNative = useRef(query);

  useEffect(() => {
    if (query !== lastNative.current) {
      lastNative.current = query;
      searchBarRef.current?.setText(query);
    }
  }, [query]);

  const onChangeText = useCallback((e: NativeSyntheticEvent<TextInputFocusEventData>) => {
    const text = e.nativeEvent.text;
    lastNative.current = text;
    onQueryChangeRef.current(text);
  }, []);

  return { searchBarRef, onChangeText };
}
