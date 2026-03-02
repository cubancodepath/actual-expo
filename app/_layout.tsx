import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { Stack } from 'expo-router';
import { usePrefsStore } from '../src/stores/prefsStore';
import { useAccountsStore } from '../src/stores/accountsStore';
import { useCategoriesStore } from '../src/stores/categoriesStore';
import { useBudgetStore } from '../src/stores/budgetStore';
import { openDatabase } from '../src/db';
import { loadClock, fullSync } from '../src/sync';

export default function RootLayout() {
  const isConfigured = usePrefsStore(s => s.isConfigured);
  const [ready, setReady] = useState(false);

  // Bootstrap: load prefs + open DB + restore CRDT clock + pre-load stores
  useEffect(() => {
    async function bootstrap() {
      await usePrefsStore.getState().loadFromStorage();
      await openDatabase();
      await loadClock();
      // Pre-load stores from local DB so screens show cached data immediately
      await Promise.allSettled([
        useAccountsStore.getState().load(),
        useCategoriesStore.getState().load(),
        useBudgetStore.getState().load(),
      ]);
    }
    bootstrap()
      .catch(console.error)
      .finally(() => setReady(true));
  }, []);

  // Sync when app comes back to foreground — mirrors loot-core's app-focused handler
  useEffect(() => {
    const sub = AppState.addEventListener('change', nextState => {
      if (nextState === 'active' && usePrefsStore.getState().isConfigured) {
        fullSync().catch(console.warn);
      }
    });
    return () => sub.remove();
  }, []);

  if (!ready) return null;

  return (
    <Stack>
      <Stack.Protected guard={!isConfigured}>
        <Stack.Screen name="(public)" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={isConfigured}>
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      </Stack.Protected>
    </Stack>
  );
}
