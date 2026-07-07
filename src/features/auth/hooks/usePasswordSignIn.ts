import { useState } from "react";
import { useRouter } from "expo-router";
import { loginWithPassword } from "@/shared/infra/api/auth/auth.api";
import { finalizeAuthenticatedSession } from "@/services/authService";

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
      await finalizeAuthenticatedSession({ serverUrl, token });
      router.replace("/(files)/files");
    } catch {
      // Already reported to the ErrorChannel bus (→ console) by the API layer.
      setLoading(false);
    }
  }

  return { password, setPassword, loading, signIn };
}
