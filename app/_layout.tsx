import { useEffect, useState } from "react";
import { AppState, useColorScheme } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import {
  ThemeProvider as NavigationThemeProvider,
  DarkTheme,
  DefaultTheme,
} from "@react-navigation/native";
import { Stack } from "expo-router";
import * as QuickActions from "expo-quick-actions";
import { ThemeProvider } from "../src/presentation/providers/ThemeProvider";
import { usePrefsStore } from "../src/stores/prefsStore";
import { useAccountsStore } from "../src/stores/accountsStore";
import { useCategoriesStore } from "../src/stores/categoriesStore";
import { useBudgetStore } from "../src/stores/budgetStore";
import { usePreferencesStore } from "../src/stores/preferencesStore";
import { useTagsStore } from "../src/stores/tagsStore";
import { usePayeesStore } from "../src/stores/payeesStore";
import { openDatabase } from "../src/db";
import { loadClock, fullSync } from "../src/sync";
import { updateAppBadge } from "../src/lib/badge";

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const hasToken = usePrefsStore((s) => s.hasToken);
  const isConfigured = usePrefsStore((s) => s.isConfigured);
  const [ready, setReady] = useState(false);

  // Bootstrap: load prefs + open DB + restore CRDT clock + pre-load stores
  useEffect(() => {
    async function bootstrap() {
      // MMKV config hydrates synchronously via persist middleware.
      // Token needs an explicit async load from SecureStore.
      await usePrefsStore.getState().loadToken();
      await openDatabase();
      await loadClock();
      // Pre-load stores from local DB so screens show cached data immediately
      await Promise.allSettled([
        useAccountsStore.getState().load(),
        useCategoriesStore.getState().load(),
        useBudgetStore.getState().load(),
        usePreferencesStore.getState().load(),
        useTagsStore.getState().load(),
        usePayeesStore.getState().load(),
      ]);
    }
    bootstrap()
      .then(() => updateAppBadge())
      .catch(console.error)
      .finally(() => setReady(true));
  }, []);

  // Update app badge when budget data changes (local edits, sync, month change)
  useEffect(() => {
    let prevData = useBudgetStore.getState().data;
    const unsub = useBudgetStore.subscribe((state) => {
      if (state.data !== prevData) {
        prevData = state.data;
        updateAppBadge();
      }
    });
    return unsub;
  }, []);

  // Register home screen quick actions only when fully authenticated with a budget
  useEffect(() => {
    if (isConfigured) {
      QuickActions.setItems([
        {
          id: "add_transaction",
          title: "Add Transaction",
          icon: "compose",
          params: { href: "/(auth)/transaction/new" },
        },
      ]);
    } else {
      QuickActions.setItems([]);
    }
  }, [isConfigured]);

  // Sync when app comes back to foreground — mirrors loot-core's app-focused handler
  useEffect(() => {
    const sub = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active" && usePrefsStore.getState().isConfigured) {
        fullSync().then(() => updateAppBadge()).catch(console.warn);
      }
    });
    return () => sub.remove();
  }, []);

  if (!ready) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <NavigationThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
    <ThemeProvider>
      <Stack>
        <Stack.Protected guard={!hasToken}>
          <Stack.Screen name="(public)" options={{ headerShown: false }} />
        </Stack.Protected>
        <Stack.Protected guard={hasToken && !isConfigured}>
          <Stack.Screen name="(files)" options={{ headerShown: false }} />
        </Stack.Protected>
        <Stack.Protected guard={isConfigured}>
          <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        </Stack.Protected>
      </Stack>
    </ThemeProvider>
    </NavigationThemeProvider>
    </GestureHandlerRootView>
  );
}
