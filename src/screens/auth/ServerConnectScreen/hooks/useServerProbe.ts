import { useState } from "react";
import { useRouter } from "expo-router";
import { getBootstrapInfo } from "@/services/api/bootstrap/bootstrap.api";

/**
 * Step 1 of auth: connect to a server and decide where to go next.
 * On success, navigates to the password or openid screen with the serverUrl.
 * Errors are already emitted to the ErrorChannel bus by the API layer, so this
 * shows nothing to the user — it only manages input + probing state.
 */
export function useServerProbe() {
  const router = useRouter();
  const [serverUrl, setServerUrl] = useState("");
  const [probing, setProbing] = useState(false);

  async function probe() {
    const url = serverUrl.trim().replace(/\/$/, "");
    if (!url) return;

    setProbing(true);
    try {
      const info = await getBootstrapInfo(url);
      if (!info.bootstrapped) {
        // Reachable but not configured. Nothing to surface to the user per
        // policy; just log it.
        // eslint-disable-next-line no-console
        console.log("[auth] server not bootstrapped:", url);
        return;
      }
      const pathname = info.loginMethod === "openid" ? "/(public)/openid" : "/(public)/password";
      router.push({ pathname, params: { serverUrl: url } });
    } catch {
      // Already reported to the ErrorChannel bus (→ console) by the API layer.
    } finally {
      setProbing(false);
    }
  }

  return { serverUrl, setServerUrl, probing, probe };
}
