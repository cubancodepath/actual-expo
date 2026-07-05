import * as SecureStore from "expo-secure-store";
import { getServerInfo } from "@/shared/infra/api/server-info/serverInfo.api";
import { useSessionStore } from "@/stores/sessionStore";
import { useBudgetContextStore } from "@/stores/budgetContextStore";
import { useServerCapabilitiesStore } from "@/stores/serverCapabilitiesStore";
import { SECURE_TOKEN_KEY } from "@/stores/prefsStorage";
import { clearAllKeys as clearEncryptionKeys } from "./encryptionKeyStorage";
import { unloadAllKeys } from "@/core/encryption";

// ---------------------------------------------------------------------------
// Auth session orchestration — plain use-cases, no React, no navigation.
// ---------------------------------------------------------------------------
// The caller (screen/hook) owns navigation after these resolve. These functions
// only coordinate state + side effects across the session/budget/server stores.

/**
 * Finalize an authenticated session: we already have a serverUrl + token, so
 * persist them and leave the app ready. Navigation is the caller's job.
 *
 * The server version fetch is intentionally fire-and-forget so login navigation
 * is immediate — getServerInfo has a 15s timeout and no retry, and awaiting it
 * would block the transition on a slow server.
 */
export async function finalizeAuthenticatedSession(params: {
  serverUrl: string;
  token: string;
}): Promise<void> {
  const { serverUrl, token } = params;

  useSessionStore.getState().setServerUrl(serverUrl);
  await useSessionStore.getState().saveToken(token);

  void getServerInfo(serverUrl).then((info) => {
    useServerCapabilitiesStore.getState().setServerVersion(info.version);
  });
}

/**
 * Full logout: wipe the token + encryption keys and reset the session, budget
 * context, and server capabilities stores. UI prefs (theme, language, onboarding)
 * are preserved by design. Navigation is the caller's job.
 */
export async function logout(): Promise<void> {
  await SecureStore.deleteItemAsync(SECURE_TOKEN_KEY);
  await clearEncryptionKeys();
  unloadAllKeys();

  useSessionStore.getState().reset();
  useBudgetContextStore.getState().reset();
  useServerCapabilitiesStore.getState().reset();
}
