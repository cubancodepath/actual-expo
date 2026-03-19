import "@/i18n/config";
import * as Sentry from "@sentry/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { AppState, Settings, useColorScheme } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import {
  ThemeProvider as NavigationThemeProvider,
  DarkTheme,
  DefaultTheme,
} from "@react-navigation/native";
import { SplashScreen, Stack, useNavigationContainerRef, useRouter } from "expo-router";
import { isRunningInExpoGo } from "expo";
import * as QuickActions from "expo-quick-actions";
import i18n from "@/i18n/config";
import { ThemeProvider } from "@/presentation/providers/ThemeProvider";
import { usePrefsStore } from "@/stores/prefsStore";
import { listen } from "@/sync/syncEvents";
import { useBudgetStore } from "@/stores/budgetStore";
import { fullSync, isSwitchingBudget } from "@/sync";
import { ensureBudgetsDir, budgetExists } from "@/services/budgetMetadata";
import { openBudget } from "@/services/budgetfiles";
import { updateAppBadge } from "@/lib/badge";
import { syncShortcutCache } from "@/lib/syncShortcutCache";
import { UndoToast } from "@/presentation/components";
import { ErrorBoundary } from "@/presentation/components/ErrorBoundary";
import { useShakeUndo } from "@/presentation/hooks/useShakeUndo";
import { loadAllPersistedKeys } from "@/services/encryptionService";

const queryClient = new QueryClient();

// Keep splash screen visible until bootstrap + data pre-load completes
SplashScreen.preventAutoHideAsync();

const navigationIntegration = Sentry.reactNavigationIntegration({
  enableTimeToInitialDisplay: !isRunningInExpoGo(),
});

Sentry.init({
  dsn: "https://1b09686fa3a236b14bed580a22f41749@o4503937990656000.ingest.us.sentry.io/4511038681645056",
  tracesSampleRate: __DEV__ ? 1.0 : 0.2,
  profilesSampleRate: __DEV__ ? 1.0 : 0.2,
  environment: __DEV__ ? "development" : "production",
  enabled: !__DEV__,
  integrations: [navigationIntegration],
  enableNativeFramesTracking: !isRunningInExpoGo(),
});

function RootLayout() {
  const ref = useNavigationContainerRef();
  const systemScheme = useColorScheme();
  const themeMode = usePrefsStore((s) => s.themeMode);
  const colorScheme = themeMode === "system" ? systemScheme : themeMode;
  const router = useRouter();
  const hasToken = usePrefsStore((s) => s.hasToken);
  const isConfigured = usePrefsStore((s) => s.isConfigured);
  const isLocalOnly = usePrefsStore((s) => s.isLocalOnly);
  const [ready, setReady] = useState(false);
  const handledTimestamp = useRef(0);

  useEffect(() => {
    if (ref) {
      navigationIntegration.registerNavigationContainer(ref);
    }
  }, [ref]);

  // Bootstrap: load prefs + open last budget if available
  useEffect(() => {
    async function bootstrap() {
      // MMKV config hydrates synchronously via persist middleware.
      // Token needs an explicit async load from SecureStore.
      await usePrefsStore.getState().loadToken();
      await ensureBudgetsDir();
      await loadAllPersistedKeys();

      // If a budget was previously open, reopen it
      const { activeBudgetId } = usePrefsStore.getState();
      if (activeBudgetId && (await budgetExists(activeBudgetId))) {
        await openBudget(activeBudgetId);
      }

      syncShortcutCache();
    }
    bootstrap()
      .catch(console.error)
      .finally(() => {
        setReady(true);
        SplashScreen.hideAsync();
      });
  }, []);

  // Keep shortcut cache in sync when accounts or categories change
  useEffect(() => {
    if (!ready) return;
    return listen((event) => {
      const tables = new Set(event.tables);
      if (tables.has("accounts") || tables.has("categories") || tables.has("category_groups")) {
        syncShortcutCache();
      }
    });
  }, [ready]);

  useEffect(() => {
    if (!ready || !isConfigured) return;

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
    const unsubTxns = listen((event) => {
      if (event.tables.includes("transactions")) {
        debouncedBadge();
      }
    });
    return () => {
      if (badgeTimer) clearTimeout(badgeTimer);
      unsubBudget();
      unsubTxns();
    };
  }, [ready, isConfigured]);

  // Register home screen quick actions only when fully authenticated with a budget
  useEffect(() => {
    if (isConfigured) {
      QuickActions.setItems([
        {
          id: "add_transaction",
          title: i18n.t("common:quickAction.addTransaction"),
          icon: "symbol:plus.circle",
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

      // Read optional pre-selections from intent parameters
      const accountId = Settings.get("shortcutAccountId") as string | null;
      const accountName = Settings.get("shortcutAccountName") as string | null;
      const categoryId = Settings.get("shortcutCategoryId") as string | null;
      const categoryName = Settings.get("shortcutCategoryName") as string | null;
      const amount = Settings.get("shortcutAmount") as number | null;
      const payeeName = Settings.get("shortcutPayeeName") as string | null;

      // Clear all shortcut state
      Settings.set({
        shortcutAction: null,
        shortcutActionTimestamp: null,
        shortcutAccountId: null,
        shortcutAccountName: null,
        shortcutCategoryId: null,
        shortcutCategoryName: null,
        shortcutAmount: null,
        shortcutPayeeName: null,
      });

      const params: Record<string, string> = {};
      if (accountId) params.accountId = accountId;
      if (accountName) params.accountName = accountName;
      if (categoryId) params.categoryId = categoryId;
      if (categoryName) params.categoryName = categoryName;
      if (amount != null) params.amount = String(amount);
      if (payeeName) params.payeeName = payeeName;

      router.push({ pathname: path as any, params });
    }

    // Check once after bootstrap (cold launch from shortcut)
    let pendingTimer: ReturnType<typeof setTimeout> | null = setTimeout(checkShortcutAction, 300);

    // Single AppState listener for both sync and shortcut check
    const sub = AppState.addEventListener("change", (nextState) => {
      if (nextState !== "active") return;
      // Sync on foreground
      const p = usePrefsStore.getState();
      if (p.isConfigured && !p.isLocalOnly && !isSwitchingBudget()) {
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

  useShakeUndo();

  if (!ready) return null;

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <KeyboardProvider>
            <NavigationThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
              <ThemeProvider>
                <Stack>
                  <Stack.Protected guard={!hasToken && !isLocalOnly}>
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
          </KeyboardProvider>
        </GestureHandlerRootView>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default Sentry.wrap(RootLayout);
