// Session operations — the usersSlice thunks that span more than the session
// store (upstream usersSlice `signOut`). signOut tears down the budget too, so
// it lives in the operations layer (operations → stores → core) instead of
// inside sessionStore, keeping that store a pure state slice with no
// sibling-store imports.
import * as SecureStore from "expo-secure-store";
import { clearAllKeys as clearEncryptionKeys } from "@/core/platform/keyStore";
import { unloadAllKeys } from "@/core/server/encryption";
import { useSessionStore } from "@/stores/sessionStore";
import { useBudgetContextStore } from "@/stores/budgetContextStore";
import { settleAndCloseCurrentBudget } from "@/stores/operations/budgetfiles";
import { resetAllStores } from "@/stores/operations/resetStores";
import { SECURE_TOKEN_KEY } from "@/stores/prefsStorage";

/**
 * Full sign-out: close the open budget, wipe the token + encryption keys, and
 * reset the session and budget-context stores (upstream usersSlice `signOut`).
 * UI prefs (theme, language, onboarding) are preserved by design. The single
 * full-teardown path — the sync policy listener and the react-query 401 hook
 * both route here, so none can leave an open database or stale state behind.
 * Navigation is the caller's job.
 */
export async function signOut(): Promise<void> {
  // Tear the budget down WITHOUT touching the stores the route guards read.
  // closeBudget() would clear activeBudgetId here, and with the token still in
  // place that is exactly the (files) group's condition — the user would see
  // the budget list flash by on the way to login.
  //
  // The sync must still settle BEFORE the token and keys go: an in-flight
  // fullSync reads the credentials, and pulling them out from under it would
  // produce spurious 401s that re-enter this same teardown through authPolicy.
  await settleAndCloseCurrentBudget().catch(() => {});

  await SecureStore.deleteItemAsync(SECURE_TOKEN_KEY);
  await clearEncryptionKeys();
  unloadAllKeys();

  // One tick, one React commit: (auth) → (public), with no (files) in between.
  // Resetting the data stores here rather than before the close also spares the
  // still-mounted budget screens a render with empty values.
  resetAllStores();
  useSessionStore.getState().reset();
  useBudgetContextStore.getState().reset();
}
