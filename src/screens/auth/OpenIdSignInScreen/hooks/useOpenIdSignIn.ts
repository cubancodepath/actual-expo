import { useState } from "react";
import { useRouter } from "expo-router";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { createOpenIdLoginUrl } from "@/services/api/auth/auth.api";
import { finalizeAuthenticatedSession } from "@/services/authService";

/**
 * Step 2b of auth: run the OpenID browser auth session, extract the token from
 * the deep-link callback, and finalize the session. Errors are already on the
 * ErrorChannel bus (API layer) — no user-facing UI.
 */
export function useOpenIdSignIn(serverUrl: string) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function signIn() {
    setLoading(true);
    try {
      const appScheme = "actualbudget";
      const hostname = new URL(serverUrl).hostname;
      const returnUrl = `${appScheme}://${hostname}`;
      const callbackUrl = `${returnUrl}/openid-cb`;

      const authUrl = await createOpenIdLoginUrl(serverUrl, returnUrl);
      const result = await WebBrowser.openAuthSessionAsync(authUrl, callbackUrl);

      if (result.type !== "success") {
        setLoading(false);
        return;
      }

      const token = Linking.parse(result.url).queryParams?.token as string | undefined;
      if (!token) {
        // eslint-disable-next-line no-console
        console.log("[auth] openid callback missing token");
        setLoading(false);
        return;
      }

      await finalizeAuthenticatedSession({ serverUrl, token });
      router.replace("/(files)/files");
    } catch {
      // Already reported to the ErrorChannel bus (→ console) by the API layer.
      setLoading(false);
    }
  }

  return { loading, signIn };
}
