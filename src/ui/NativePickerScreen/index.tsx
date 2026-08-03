import { useMemo } from "react";
import { ScrollView } from "react-native";
import { Stack } from "expo-router";
import { useTranslation } from "react-i18next";
import { useThemeColor } from "heroui-native";
import type { NativeStackNavigationOptions } from "@react-navigation/native-stack";
import { Screen } from "@/ui/Screen";
import { ScreenFade } from "@/ui/ScreenFade";
import { useHeaderActionOptions } from "@/ui/header-actions/useHeaderActionOptions";
import { useKeyboardInset } from "@/lib/hooks/useKeyboardInset";
import { useSearchBridge } from "./useSearchBridge";
import { useSearchBarAutoFocus } from "./useSearchBarAutoFocus";
import type { NativePickerScreenProps } from "./types";

/**
 * Full-screen picker scaffold on the native stack header + native search bar.
 *
 * Replaces the old custom header, whose height had to be measured with
 * `onLayout` and fed back as the content's `paddingTop` — the first frame
 * always painted with the wrong padding and the second corrected it, which read
 * as a jump on every open. The native header owns the content inset, so there
 * is nothing to measure and nothing to correct.
 *
 * The chrome follows the HeroUI fitness example: the route declares
 * `PICKER_HEADER_OPTIONS` (transparent header) in its navigator, the list takes
 * its inset from `contentInsetAdjustmentBehavior`, and `ScreenFade` sits last
 * so it paints over the content. No `headerBlurEffect` — on iOS 26 the system
 * already draws liquid glass behind a transparent header, and `ScreenFade`
 * covers older versions.
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
  const [foreground, accent] = useThemeColor(["foreground", "accent"]);
  const { searchBarRef, onChangeText } = useSearchBridge(query, onQueryChange);
  const focusTracking = useSearchBarAutoFocus(searchBarRef, autoFocus);
  const keyboardInset = useKeyboardInset();
  const controlOptions = useHeaderActionOptions({ left: headerLeft, right: headerRight });

  // One options object, not two: each one expo-router applies is another
  // `setOptions` pass, and every pass reconfigures the native header.
  const screenOptions = useMemo<NativeStackNavigationOptions>(
    () => ({ title, ...controlOptions }),
    [title, controlOptions],
  );

  return (
    <Screen>
      <Stack.Screen options={screenOptions} />

      {/*
       * Built from the same `search` object the route seeded (see
       * `usePickerHeaderOptions`). These props REPLACE the seeded ones instead
       * of merging, so anything the route set and this leaves out would go
       * back to arriving a frame late.
       *
       * `query` and `onQueryChange` deliberately do NOT feed these props: the
       * bridge keeps `searchBarRef` and `onChangeText` stable so typing never
       * re-registers the bar, which would rebuild it natively and drop the
       * keyboard.
       */}
      <Stack.SearchBar
        ref={searchBarRef}
        placeholder={t(search.placeholderKey)}
        placement={search.placement}
        allowToolbarIntegration={search.placement === "integrated"}
        hideWhenScrolling={false}
        hideNavigationBar={false}
        autoCapitalize="none"
        textColor={foreground}
        tintColor={accent}
        onChangeText={onChangeText}
        onFocus={focusTracking.onFocus}
        onBlur={focusTracking.onBlur}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        // Required by headerSearchBarOptions, and what gives the list its top
        // inset under the transparent header.
        contentInsetAdjustmentBehavior="automatic"
        // Deliberately NOT `automaticallyAdjustKeyboardInsets`. The search field
        // lives in the native header, outside this scroll view, and React
        // Native's implementation looks for a text input among the scroll
        // view's own descendants to keep visible. Finding none, it takes its
        // "keyboard opened for other reason" branch and scrolls the content
        // down by the whole keyboard height (`RCTScrollView.m`,
        // `_keyboardWillChangeFrame`) — which, with nothing to reveal, just
        // shoved the first rows up under the header the moment you started
        // typing. Padding gives the same reach and cannot move the offset.
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        contentContainerClassName="px-4"
        contentContainerStyle={{ paddingBottom: keyboardInset + 40 }}
      >
        {children}
      </ScrollView>

      <ScreenFade edge="top" />
    </Screen>
  );
}
