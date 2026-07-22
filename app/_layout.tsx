import "../global.css";
import "@/i18n/config";
import * as Sentry from "@sentry/react-native";
import { QueryClientProvider } from "@tanstack/react-query";
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
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
} from "@expo-google-fonts/inter";
import i18n from "@/i18n/config";
import { HeroUINativeProvider } from "heroui-native";
import { Uniwind } from "uniwind";
import { ThemeProvider } from "@/design-system/providers/ThemeProvider";
import { useSessionStore } from "@/stores/sessionStore";
import { useBudgetContextStore } from "@/stores/budgetContextStore";
import { useSyncStore } from "@/stores/syncStore";
import { useGlobalPref } from "@/lib/hooks/useGlobalPref";
import { useIsConfigured, getIsConfigured } from "@/stores/session.selectors";
import { listen } from "@/core/sync/syncEvents";
import { emitErrorEvent } from "@/lib/errors/ErrorChannel";
import { isSwitchingBudget, setSyncingMode } from "@/core/sync";
import { ensureBudgetsDir, budgetExists } from "@/services/budgetMetadata";
import { loadBudget } from "@/services/budgetfiles";
import { updateAppBadge } from "@/lib/badge";
import { syncShortcutCache } from "@/lib/syncShortcutCache";
import { UndoToast } from "@/design-system";
import { ErrorBoundary } from "@/ui/feedback/ErrorBoundary";
import { ErrorChannelConsumer } from "@/ui/feedback/ErrorChannelConsumer";
import { SyncConflictDialog } from "@/ui/feedback/SyncConflictDialog";
import { DialogHost } from "@/ui/feedback/dialog";
import { useShakeUndo } from "@/hooks/useShakeUndo";
import { loadAllPersistedKeys } from "@/core/encryption/keys";
import { installGlobalHandlers } from "@/lib/errors/install";
import { scrubEvent } from "@/lib/errors/sentryScrub";

import { queryClient } from "@/lib/query/queryClient";

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
  beforeSend: (event) => scrubEvent(event),
});

// Must run after Sentry.init (chains onto the ErrorUtils handler Sentry installs).
installGlobalHandlers();

function RootLayout() {
  const ref = useNavigationContainerRef();
  const systemScheme = useColorScheme();
  const [themePref] = useGlobalPref("theme");
  const themeMode = themePref === "light" || themePref === "dark" ? themePref : "system";
  const colorScheme = themeMode === "system" ? systemScheme : themeMode;

  // Bridge the user's theme override into Uniwind so HeroUI-rendered screens
  // follow it too. `themeMode` is exactly Uniwind's theme vocabulary
  // ("system" re-enables adaptive/OS following; "light"/"dark" force a theme).
  // Without this, HeroUI screens only ever track the OS color scheme.
  useEffect(() => {
    Uniwind.setTheme(themeMode);
  }, [themeMode]);
  const router = useRouter();
  const hasToken = useSessionStore((s) => s.hasToken);
  const isConfigured = useIsConfigured();
  const isLocalOnly = useBudgetContextStore((s) => s.isLocalOnly);
  const [ready, setReady] = useState(false);
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
  });
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
      await useSessionStore.getState().loadToken();
      await ensureBudgetsDir();
      await loadAllPersistedKeys();

      // If a budget was previously open, reopen it
      const { activeBudgetId } = useBudgetContextStore.getState();
      if (activeBudgetId && (await budgetExists(activeBudgetId))) {
        await loadBudget(activeBudgetId);
      }

      syncShortcutCache();
    }
    bootstrap()
      .catch((error) => {
        emitErrorEvent(error, { operation: "bootstrap" });
      })
      .finally(() => setReady(true));
  }, []);

  // Keep splash visible until both bootstrap and font loading finish
  useEffect(() => {
    if (ready && fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [ready, fontsLoaded]);

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

    // Debounce badge updates to coalesce rapid changes (e.g. during sync)
    let badgeTimer: ReturnType<typeof setTimeout> | null = null;
    const debouncedBadge = () => {
      if (badgeTimer) clearTimeout(badgeTimer);
      badgeTimer = setTimeout(updateAppBadge, 500);
    };

    const unsubEvents = listen((event) => {
      const tables = new Set(event.tables);
      if (tables.has("transactions") || tables.has("spreadsheet_cells")) {
        debouncedBadge();
      }
    });
    return () => {
      if (badgeTimer) clearTimeout(badgeTimer);
      unsubEvents();
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

    // Periodic foreground sync every 60s — differs from upstream desktop app
    // which has no periodic sync. On mobile, users often co-edit on web + phone
    // simultaneously, and without polling they'd only see web changes after
    // backgrounding and re-opening the app. 60s matches what Notion/Confluence
    // use for "live enough without being aggressive" on mobile.
    let syncInterval: ReturnType<typeof setInterval> | null = null;

    const startSyncPolling = () => {
      if (syncInterval) clearInterval(syncInterval);
      if (getIsConfigured() && !useBudgetContextStore.getState().isLocalOnly) {
        syncInterval = setInterval(() => {
          if (!isSwitchingBudget()) useSyncStore.getState().sync().catch(console.warn);
        }, 60_000);
      }
    };

    const stopSyncPolling = () => {
      if (syncInterval) {
        clearInterval(syncInterval);
        syncInterval = null;
      }
    };

    // Single AppState listener for sync, polling, and shortcut check
    const sub = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        // Sync immediately on foreground — also clears any "offline" mode
        // left over from a prior network failure, so returning to the app
        // is always a real retry, not silently skipped. Except while a
        // file-state conflict is pending: that "offline" is deliberate
        // (sync stays paused until the user resolves SyncConflictDialog).
        if (
          getIsConfigured() &&
          !useBudgetContextStore.getState().isLocalOnly &&
          !isSwitchingBudget() &&
          !useSyncStore.getState().conflictCode
        ) {
          setSyncingMode("enabled");
          useSyncStore.getState().sync().catch(console.warn);
        }
        startSyncPolling();
        // Check shortcut action with debounced timer
        if (pendingTimer) clearTimeout(pendingTimer);
        pendingTimer = setTimeout(checkShortcutAction, 300);
      } else {
        stopSyncPolling();
      }
    });

    // Start polling on initial mount (app is already active)
    startSyncPolling();

    return () => {
      if (pendingTimer) clearTimeout(pendingTimer);
      stopSyncPolling();
      sub.remove();
    };
  }, [ready, isConfigured, router]);

  useShakeUndo();

  if (!ready || !fontsLoaded) return null;

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <KeyboardProvider>
            <NavigationThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
              <ThemeProvider>
                <HeroUINativeProvider>
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
                  <SyncConflictDialog />
                  <DialogHost />
                  <ErrorChannelConsumer />
                </HeroUINativeProvider>
              </ThemeProvider>
            </NavigationThemeProvider>
          </KeyboardProvider>
        </GestureHandlerRootView>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default Sentry.wrap(RootLayout);
