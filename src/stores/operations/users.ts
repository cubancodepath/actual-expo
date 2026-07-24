// Session operations — the usersSlice thunks that span more than the session
// store (upstream usersSlice `signOut`). signOut tears down the budget too, so
// it lives in the operations layer (operations → stores → core) instead of
// inside sessionStore, keeping that store a pure state slice with no
// sibling-store imports.
import * as SecureStore from "expo-secure-store";
import { clearAllKeys as clearEncryptionKeys } from "@/core/platform/keyStore";
import { unloadAllKeys } from "@/core/encryption";
import { useSessionStore } from "@/stores/sessionStore";
import { useBudgetContextStore } from "@/stores/budgetContextStore";
import { closeBudget } from "@/stores/operations/budgetfiles";
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
  // Close the budget first: settles in-flight sync, resets the data stores,
  // closes the DB.
  await closeBudget().catch(() => {});

  await SecureStore.deleteItemAsync(SECURE_TOKEN_KEY);
  await clearEncryptionKeys();
  unloadAllKeys();

  useSessionStore.getState().reset();
  useBudgetContextStore.getState().reset();
}
