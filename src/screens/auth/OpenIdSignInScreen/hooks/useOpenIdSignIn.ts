import { useState } from "react";
import { useRouter } from "expo-router";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { createOpenIdLoginUrl } from "@/services/api/auth/auth.api";
import { finalizeAuthenticatedSession } from "@/services/authService";
import { isExpectedOpenIdCallback, OPENID_CALLBACK_SCHEME } from "./isExpectedOpenIdCallback";

/**
 * Step 2b of auth: run the OpenID browser auth session, extract the token from
 * the deep-link callback, and finalize the session. Errors are already on the
 * ErrorChannel bus (API layer) — no user-facing UI.
 *
 * The Actual sync server does not echo a client-supplied state/nonce back
 * onto this callback (see docs/architecture-differences.md), so the callback
 * URL's scheme/hostname/path are validated before `token` is ever read.
 */
export function useOpenIdSignIn(serverUrl: string) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function signIn() {
    setLoading(true);
    try {
      const hostname = new URL(serverUrl).hostname;
      const returnUrl = `${OPENID_CALLBACK_SCHEME}://${hostname}`;
      const callbackUrl = `${returnUrl}/openid-cb`;

      const authUrl = await createOpenIdLoginUrl(serverUrl, returnUrl);
      const result = await WebBrowser.openAuthSessionAsync(authUrl, callbackUrl);

      if (result.type !== "success") {
        setLoading(false);
        return;
      }

      if (!isExpectedOpenIdCallback(result.url, hostname)) {
        if (__DEV__) {
          // eslint-disable-next-line no-console
          console.log("[auth] openid callback failed URL validation");
        }
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
