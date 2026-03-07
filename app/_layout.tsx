import { useEffect, useRef, useState } from "react";
import { AppState, Settings, useColorScheme } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import {
  ThemeProvider as NavigationThemeProvider,
  DarkTheme,
  DefaultTheme,
} from "@react-navigation/native";
import { Stack, useRouter } from "expo-router";
import * as QuickActions from "expo-quick-actions";
import { ThemeProvider } from "../src/presentation/providers/ThemeProvider";
import { usePrefsStore } from "../src/stores/prefsStore";
import { useAccountsStore } from "../src/stores/accountsStore";
import { useCategoriesStore } from "../src/stores/categoriesStore";
import { useBudgetStore } from "../src/stores/budgetStore";
import { usePreferencesStore } from "../src/stores/preferencesStore";
import { useTagsStore } from "../src/stores/tagsStore";
import { usePayeesStore } from "../src/stores/payeesStore";
import { useTransactionsStore } from "../src/stores/transactionsStore";
import { openDatabase } from "../src/db";
import { loadClock, fullSync, isSwitchingBudget } from "../src/sync";
import { updateAppBadge } from "../src/lib/badge";
import { UndoToast } from "../src/presentation/components";

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const router = useRouter();
  const hasToken = usePrefsStore((s) => s.hasToken);
  const isConfigured = usePrefsStore((s) => s.isConfigured);
  const [ready, setReady] = useState(false);
  const handledTimestamp = useRef(0);

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
      .catch(console.error)
      .finally(() => setReady(true));
  }, []);

  useEffect(() => {
    if (!isConfigured) return;

    updateAppBadge();

    // Debounce badge updates to coalesce rapid store changes (e.g. during sync)
    let badgeTimer: ReturnType<typeof setTimeout> | null = null;
    const debouncedBadge = () => {
      if (badgeTimer) clearTimeout(badgeTimer);
      badgeTimer = setTimeout(updateAppBadge, 500);
    };

    let prevBudget = useBudgetStore.getState().data;
    const unsubBudget = useBudgetStore.subscribe((state) => {
      if (state.data !== prevBudget) {
        prevBudget = state.data;
        debouncedBadge();
      }
    });
    let prevTxns = useTransactionsStore.getState().transactions;
    const unsubTxns = useTransactionsStore.subscribe((state) => {
      if (state.transactions !== prevTxns) {
        prevTxns = state.transactions;
        debouncedBadge();
      }
    });
    return () => {
      if (badgeTimer) clearTimeout(badgeTimer);
      unsubBudget();
      unsubTxns();
    };
  }, [isConfigured]);

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

  // Handle pending shortcut action (written to UserDefaults by AddTransactionIntent)
  useEffect(() => {
    if (!ready || !isConfigured) return;

    function checkShortcutAction() {
      const path = Settings.get("shortcutAction") as string | null;
      const ts = Settings.get("shortcutActionTimestamp") as number | null;
      if (!path || !ts) return;
      // Ignore stale actions (> 10s old) or already-handled ones
      const age = Date.now() / 1000 - ts;
      if (age > 10 || ts <= handledTimestamp.current) return;
      handledTimestamp.current = ts;
      Settings.set({ shortcutAction: null, shortcutActionTimestamp: null });
      router.push(path as any);
    }

    // Check once after bootstrap (cold launch from shortcut)
    let pendingTimer: ReturnType<typeof setTimeout> | null = setTimeout(checkShortcutAction, 300);

    // Single AppState listener for both sync and shortcut check
    const sub = AppState.addEventListener("change", (nextState) => {
      if (nextState !== "active") return;
      // Sync on foreground
      if (usePrefsStore.getState().isConfigured && !isSwitchingBudget()) {
        fullSync().catch(console.warn);
      }
      // Check shortcut action with debounced timer
      if (pendingTimer) clearTimeout(pendingTimer);
      pendingTimer = setTimeout(checkShortcutAction, 300);
    });

    return () => {
      if (pendingTimer) clearTimeout(pendingTimer);
      sub.remove();
    };
  }, [ready, isConfigured, router]);

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
      <UndoToast />
    </ThemeProvider>
    </NavigationThemeProvider>
    </GestureHandlerRootView>
  );
}
