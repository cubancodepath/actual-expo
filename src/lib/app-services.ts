// Composition root for app-lifetime service wiring — the cross-cutting
// listeners the app registers once on mount and tears down on unmount.
//
// Called from a mount effect in app/_layout.tsx (`useEffect(installAppServices,
// [])`); the returned cleanup unsubscribes everything. Doing this as a React
// lifecycle effect (not a module-scope side effect) makes it StrictMode- and
// Fast-Refresh-safe: no duplicate listeners in development.
//
// Deliberately NOT here (they must run at import time, before any component
// mounts): Sentry.init and installGlobalHandlers (crash handlers), and the
// queryClient singleton (which now holds no policy of its own).
import { listenForSyncEvent } from "@/lib/sync-events";
import { installAuthPolicy } from "@/lib/errors/authPolicy";

/** Register app-lifetime services. Returns a cleanup that unregisters them. */
export function installAppServices(): () => void {
  const unlisteners = [
    // Sync policy owner (status, conflict recovery, error reporting).
    listenForSyncEvent(),
    // Expired-token → signOut policy (subscribes to the error bus).
    installAuthPolicy(),
  ];

  return () => {
    for (const unlisten of unlisteners) unlisten();
  };
}
