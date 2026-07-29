import { useMemo } from "react";
import { ScrollView } from "react-native";
import { Stack } from "expo-router";
import { useThemeColor } from "heroui-native";
import type { NativeStackNavigationOptions } from "@react-navigation/native-stack";
import { Screen } from "@/ui/Screen";
import { useHeaderActionOptions } from "@/ui/header-actions/useHeaderActionOptions";
import { useSearchBridge } from "./useSearchBridge";
import type { NativePickerScreenProps } from "./types";

/**
 * Android picker scaffold — see `index.tsx` for the shared rationale.
 *
 * Deliberately NOT the base variant: the header stays opaque. A translucent nav
 * bar over scrolling content is an iOS idiom, and Android has no header blur
 * anyway (`headerBlurEffect` is iOS-only). No `ScreenFade` for the same reason:
 * with an opaque header nothing scrolls underneath to fade out. And no
 * `contentInsetAdjustmentBehavior`, which is an iOS-only prop — the solid
 * header already pushes the content down.
 */
export function NativePickerScreen({
  title,
  query,
  onQueryChange,
  searchPlaceholder,
  headerLeft,
  headerRight,
  children,
}: NativePickerScreenProps) {
  const muted = useThemeColor("muted");
  const { searchBarRef, onChangeText } = useSearchBridge(query, onQueryChange);
  const controlOptions = useHeaderActionOptions({ left: headerLeft, right: headerRight });

  // `query` and `onQueryChange` must stay OUT of these deps: expo-router's
  // Screen re-runs setOptions whenever the options object changes identity, and
  // a new headerSearchBarOptions rebuilds the native bar and drops the keyboard.
  const searchOptions = useMemo<NativeStackNavigationOptions>(
    () => ({
      title,
      headerSearchBarOptions: {
        ref: searchBarRef,
        placeholder: searchPlaceholder,
        autoCapitalize: "none",
        hintTextColor: muted,
        headerIconColor: muted,
        onChangeText,
      },
    }),
    [title, searchPlaceholder, muted, searchBarRef, onChangeText],
  );

  return (
    <Screen>
      <Stack.Screen options={searchOptions} />
      <Stack.Screen options={controlOptions} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        // No `automaticallyAdjustKeyboardInsets` — it is an iOS-only prop with
        // no Android implementation. Android resizes the window instead
        // (`windowSoftInputMode=adjustResize`), so this scroll view shrinks on
        // its own when the keyboard opens.
        // `interactive` dismissal is iOS-only; Android gets on-drag.
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        contentContainerClassName="px-4 pb-safe-offset-10"
      >
        {children}
      </ScrollView>
    </Screen>
  );
}
