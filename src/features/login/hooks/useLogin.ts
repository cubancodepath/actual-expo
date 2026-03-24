import { useRef, useState } from "react";
import { useRouter } from "expo-router";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { useTranslation } from "react-i18next";
import {
  getBootstrapInfo,
  login,
  initiateOpenIdLogin,
  type LoginMethod,
} from "@/services/authService";
import { getServerInfo } from "@/services/serverInfo";
import { usePrefsStore } from "@/stores/prefsStore";
import { useErrorHandler } from "@/hooks/useErrorHandler";

export type LoginStep = "idle" | "probing" | LoginMethod;

export function useLogin() {
  const router = useRouter();
  const { setPrefs, saveToken } = usePrefsStore();
  const { t } = useTranslation("auth");
  const [serverUrl, setServerUrl] = useState("");
  const [password, setPassword] = useState("");
  const [step, setStep] = useState<LoginStep>("idle");
  const [loading, setLoading] = useState(false);
  const { error, handleError, setValidationError, dismissError } = useErrorHandler();

  const urlRef = useRef("");

  const isLocked = step !== "idle" && step !== "probing";

  // ── Helpers ───────────────────────────────────────────────────────────────

  async function probeWithRetry(url: string) {
    const retryDelays = [1500, 2500, 3000];
    let lastError: unknown;

    try {
      return await getBootstrapInfo(url);
    } catch (e) {
      lastError = e;
    }

    for (const delay of retryDelays) {
      await new Promise((r) => setTimeout(r, delay));
      try {
        return await getBootstrapInfo(url);
      } catch (e) {
        lastError = e;
      }
    }

    throw lastError;
  }

  async function saveLoginAndRedirect(serverUrl: string, token: string) {
    setPrefs({ serverUrl });
    await saveToken(token);
    getServerInfo(serverUrl).then((info) => {
      usePrefsStore.getState().setServerVersion(info.version);
    });
    router.replace("/(files)/files");
  }

  // ── Actions ───────────────────────────────────────────────────────────────

  function handleServerUrlChange(v: string) {
    setServerUrl(v);
    setStep("idle");
    dismissError();
  }

  async function handleProbe() {
    let url = serverUrl.trim().replace(/\/$/, "");
    if (!url) {
      setValidationError(t("serverUrlRequired"));
      return;
    }

    if (!/^https?:\/\//i.test(url)) {
      url = `https://${url}`;
      setServerUrl(url);
    }

    setStep("probing");
    const info = await handleError(() => probeWithRetry(url), { silenceNetwork: false });
    if (!info) {
      setStep("idle");
      return;
    }

    urlRef.current = url;
    if (!info.bootstrapped) {
      setValidationError(t("serverNotSetUp"));
      setStep("idle");
      return;
    }

    setStep(info.loginMethod);
  }

  function handlePasswordChange(v: string) {
    setPassword(v);
    dismissError();
  }

  async function handlePasswordLogin() {
    setLoading(true);
    await handleError(
      async () => {
        const token = await login(urlRef.current, password.trim());
        await saveLoginAndRedirect(urlRef.current, token);
      },
      { silenceNetwork: false },
    );
    setLoading(false);
  }

  async function handleOpenIdLogin() {
    setLoading(true);
    await handleError(
      async () => {
        const url = urlRef.current;
        const appScheme = "actualbudget";
        const serverHostname = new URL(url).hostname;
        const returnUrl = `${appScheme}://${serverHostname}`;
        const callbackUrl = `${returnUrl}/openid-cb`;

        const authUrl = await initiateOpenIdLogin(url, returnUrl);
        const result = await WebBrowser.openAuthSessionAsync(authUrl, callbackUrl);

        if (result.type !== "success") {
          setLoading(false);
          return;
        }

        const parsed = Linking.parse(result.url);
        const token = parsed.queryParams?.token as string | undefined;
        if (!token) {
          setValidationError(t("openIdNoToken"));
          setLoading(false);
          return;
        }

        await saveLoginAndRedirect(url, token);
      },
      { silenceNetwork: false },
    );
    setLoading(false);
  }

  function handleChangeServer() {
    setStep("idle");
    setPassword("");
    dismissError();
  }

  function handleLocalMode() {
    usePrefsStore.getState().setPrefs({
      activeBudgetId: "",
      fileId: "",
      groupId: "",
      encryptKeyId: undefined,
      lastSyncedTimestamp: undefined,
      budgetName: undefined,
    });
    router.push("/(public)/local-setup");
  }

  return {
    serverUrl,
    password,
    step,
    loading,
    error,
    isLocked,
    handleServerUrlChange,
    handleProbe,
    handlePasswordChange,
    handlePasswordLogin,
    handleOpenIdLogin,
    handleChangeServer,
    handleLocalMode,
    dismissError,
  };
}
