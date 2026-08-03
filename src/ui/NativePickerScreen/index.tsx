import { useMemo } from "react";
import { ScrollView } from "react-native";
import { Stack } from "expo-router";
import { useThemeColor } from "heroui-native";
import type { NativeStackNavigationOptions } from "@react-navigation/native-stack";
import { Screen } from "@/ui/Screen";
import { ScreenFade } from "@/ui/ScreenFade";
import { useHeaderActionOptions } from "@/ui/header-actions/useHeaderActionOptions";
import { useSearchBridge } from "./useSearchBridge";
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
  searchPlaceholder,
  searchPlacement = "stacked",
  headerLeft,
  headerRight,
  children,
}: NativePickerScreenProps) {
  const [foreground, accent] = useThemeColor(["foreground", "accent"]);
  const { searchBarRef, onChangeText } = useSearchBridge(query, onQueryChange);
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
       * Declarative, so it lands as one merged options update rather than as a
       * `setOptions` that attaches a search bar to a header already configured
       * without one — the route seeds `placement` for the first frame (see
       * `pickerHeaderOptions`) and this replaces it with the full config.
       *
       * `query` and `onQueryChange` deliberately do NOT feed these props: the
       * bridge keeps `searchBarRef` and `onChangeText` stable so typing never
       * re-registers the bar, which would rebuild it natively and drop the
       * keyboard.
       */}
      <Stack.SearchBar
        ref={searchBarRef}
        placeholder={searchPlaceholder}
        placement={searchPlacement}
        allowToolbarIntegration={searchPlacement === "integrated"}
        hideWhenScrolling={false}
        hideNavigationBar={false}
        autoCapitalize="none"
        textColor={foreground}
        tintColor={accent}
        onChangeText={onChangeText}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        // Required by headerSearchBarOptions, and what gives the list its top
        // inset under the transparent header.
        contentInsetAdjustmentBehavior="automatic"
        // The search field lives in the native header, OUTSIDE this scroll
        // view. That rules out KeyboardAwareScrollView, whose auto-scroll is
        // gated on the focused input belonging to the scroll view — for a
        // header-owned field it silently degrades to a padding spacer. UIKit's
        // own adjustment derives the inset from geometry alone (scroll view's
        // bottom edge vs. keyboard frame), so it works regardless of who holds
        // first responder, and it moves the scroll indicators too.
        automaticallyAdjustKeyboardInsets
        // Dragging the list puts the keyboard away, like every native
        // search-and-pick screen.
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        contentContainerClassName="px-4 pb-10"
      >
        {children}
      </ScrollView>

      <ScreenFade edge="top" />
    </Screen>
  );
}
