import { useState } from "react";
import { useRouter } from "expo-router";
import { loginWithPassword } from "@/core/server/auth/auth.api";
import { useSessionStore } from "@/stores/sessionStore";
import { emitErrorEvent } from "@/lib/errors/ErrorChannel";

/**
 * Step 2a of auth: exchange a password for a token and finalize the session.
 * Errors are already on the ErrorChannel bus (API layer) — no user-facing UI.
 */
export function usePasswordSignIn(serverUrl: string) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function signIn() {
    setLoading(true);
    try {
      const token = await loginWithPassword(serverUrl, password.trim());
      await useSessionStore.getState().loggedIn({ serverUrl, token });
      router.replace("/(files)/files");
    } catch (e) {
      // Core transport only throws; surface to the error bus here.
      emitErrorEvent(e, { operation: "loginWithPassword" });
      setLoading(false);
    }
  }

  return { password, setPassword, loading, signIn };
}
