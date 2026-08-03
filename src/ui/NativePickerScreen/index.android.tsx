import { useMemo } from "react";
import { ScrollView } from "react-native";
import { Stack } from "expo-router";
import { useTranslation } from "react-i18next";
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
  search,
  autoFocus = false,
  headerLeft,
  headerRight,
  children,
}: NativePickerScreenProps) {
  const { t } = useTranslation("transactions");
  const muted = useThemeColor("muted");
  const { searchBarRef, onChangeText } = useSearchBridge(query, onQueryChange);
  const controlOptions = useHeaderActionOptions({ left: headerLeft, right: headerRight });

  // See the base file: one options object, and the search bar declared rather
  // than pushed through `setOptions`.
  const screenOptions = useMemo<NativeStackNavigationOptions>(
    () => ({ title, ...controlOptions }),
    [title, controlOptions],
  );

  return (
    <Screen>
      <Stack.Screen options={screenOptions} />

      {/* No `placement` — that's an iOS concept; Android puts the field where
          the platform puts it. */}
      <Stack.SearchBar
        ref={searchBarRef}
        placeholder={t(search.placeholderKey)}
        // The real prop, unlike on iOS: `autoFocus` is implemented in the
        // Android search bar (SearchBarView.kt), so there is nothing to retry.
        autoFocus={autoFocus}
        autoCapitalize="none"
        hintTextColor={muted}
        headerIconColor={muted}
        onChangeText={onChangeText}
      />

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
