import { Stack } from "expo-router";
import { useQuickActionRouting } from "expo-quick-actions/router";
import { useTranslation } from "react-i18next";
import { HERO_HEADER_OPTIONS, TRANSLUCENT_HEADER_OPTIONS } from "@/lib/hooks/screenHeaderOptions";
import { useStackOptions } from "@/lib/hooks/useStackOptions";

export default function AuthLayout() {
  useQuickActionRouting();
  const { screen, modal, formSheet } = useStackOptions();
  const { t } = useTranslation();

  return (
    <Stack screenOptions={screen}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false, title: "" }} />
      <Stack.Screen name="account/new" options={{ headerShown: false, ...modal }} />
      <Stack.Screen name="account/[id]" options={{ ...screen, headerShown: false }} />
      <Stack.Screen
        name="account/search"
        options={{
          ...screen,
          animation: "fade",
          animationDuration: 150,
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="account/reconcile"
        options={{ headerShown: false, ...formSheet([1.0]) }}
      />
      <Stack.Screen
        name="encryption-password"
        options={{ headerShown: false, ...formSheet([1.0]) }}
      />
      <Stack.Screen name="account/settings" options={{ headerShown: false, ...modal }} />
      <Stack.Screen name="account/close" options={{ headerShown: false, ...formSheet([1.0]) }} />
      <Stack.Screen name="transaction" options={{ headerShown: false, ...modal }} />
      <Stack.Screen name="transaction-categorize" options={{ headerShown: false, ...modal }} />
      <Stack.Screen name="transaction-move" options={{ headerShown: false, ...modal }} />
      <Stack.Screen
        name="budget/assign-money"
        options={{ headerShown: false, ...modal, gestureEnabled: false }}
      />
      {/* Transparent on both platforms: the plan editor's tinted hero bleeds up
          under the bar, and an opaque one would slice its top off. */}
      <Stack.Screen
        name="budget/edit"
        options={{ ...HERO_HEADER_OPTIONS, headerBackButtonDisplayMode: "minimal" }}
      />
      <Stack.Screen name="budget/hidden-categories" options={{ headerShown: false }} />
      {/* The only budget screen on the native bar so far: its header carries the
          action that commits the new order, and the list floats under it. */}
      <Stack.Screen
        name="budget/reorder-categories"
        options={{ ...TRANSLUCENT_HEADER_OPTIONS, headerBackButtonDisplayMode: "minimal" }}
      />
      <Stack.Screen
        name="budget/rename-category"
        options={{
          headerShown: false,
          ...modal,
        }}
      />
      <Stack.Screen
        name="budget/category-details"
        options={{
          headerShown: false,
          ...modal,
        }}
      />
      {/* A directory route with its own nested stack (list → editor → mode),
          presented as one card modal — same arrangement as `transaction`. */}
      <Stack.Screen name="budget/goal" options={{ headerShown: false, ...modal }} />
      <Stack.Screen
        name="budget/category-transactions"
        options={{ ...modal, headerShown: false }}
      />
      <Stack.Screen
        name="budget/cover-overspent"
        options={{ headerShown: false, ...formSheet([0.45]) }}
      />
      <Stack.Screen
        name="budget/cover-source"
        options={{ headerShown: false, ...formSheet([1.0]) }}
      />
      <Stack.Screen
        name="budget/move-money"
        options={{ headerShown: false, ...formSheet([1.0]) }}
      />
      <Stack.Screen
        name="budget/category-picker"
        options={{
          headerShown: false,
          ...formSheet([0.5, 1.0]),
          sheetGrabberVisible: true,
        }}
      />
      <Stack.Screen name="budget/hold" options={{ headerShown: false, ...formSheet([1.0]) }} />
      <Stack.Screen
        name="budget/delete-category-picker"
        options={{
          headerShown: false,
          ...modal,
        }}
      />
      <Stack.Screen name="schedule" options={{ headerShown: false, ...modal }} />
      <Stack.Screen
        name="settings"
        options={{ ...screen, headerShown: false, presentation: "fullScreenModal" }}
      />
      <Stack.Screen
        name="new-budget"
        options={{ ...screen, headerShown: false, presentation: "fullScreenModal" }}
      />
    </Stack>
  );
}
