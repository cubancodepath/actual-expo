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

const PROBE_RETRY_DELAYS = [1500, 2500, 3000];

async function probeWithRetry(url: string) {
  let lastError: unknown;

  try {
    return await getBootstrapInfo(url);
  } catch (e) {
    lastError = e;
  }

  for (const delay of PROBE_RETRY_DELAYS) {
    await new Promise((r) => setTimeout(r, delay));
    try {
      return await getBootstrapInfo(url);
    } catch (e) {
      lastError = e;
    }
  }

  throw lastError;
}

export type LoginStep = "idle" | "probing" | LoginMethod;

export interface UseLoginFlowReturn {
  serverUrl: string;
  password: string;
  step: LoginStep;
  loading: boolean;
  error: ReturnType<typeof useErrorHandler>["error"];
  isServerLocked: boolean;
  setServerUrl: (v: string) => void;
  setPassword: (v: string) => void;
  handleProbe: () => Promise<void>;
  handlePasswordLogin: () => Promise<void>;
  handleOpenIdLogin: () => Promise<void>;
  handleChangeServer: () => void;
  dismissError: () => void;
}

export function useLoginFlow(): UseLoginFlowReturn {
  const router = useRouter();
  const { t } = useTranslation("auth");
  const [serverUrl, setServerUrlState] = useState("");
  const [password, setPasswordState] = useState("");
  const [step, setStep] = useState<LoginStep>("idle");
  const [loading, setLoading] = useState(false);
  const { error, handleError, setValidationError, dismissError } = useErrorHandler();

  const urlRef = useRef("");

  const isServerLocked = step !== "idle" && step !== "probing";

  function setServerUrl(v: string) {
    setServerUrlState(v);
    setStep("idle");
    dismissError();
  }

  function setPassword(v: string) {
    setPasswordState(v);
    dismissError();
  }

  // ── Shared success tail: persist token, cache server version, navigate ────
  async function completeLogin(url: string, token: string) {
    usePrefsStore.getState().setPrefs({ serverUrl: url });
    await usePrefsStore.getState().saveToken(token);
    getServerInfo(url).then((info) => {
      usePrefsStore.getState().setServerVersion(info.version);
    });
    router.replace("/(files)/files");
  }

  // ── Step 1: Probe server ──────────────────────────────────────────────────
  async function handleProbe() {
    const url = serverUrl.trim().replace(/\/$/, "");
    if (!url) {
      setValidationError(t("serverUrlRequired"));
      return;
    }

    setStep("probing");
    const info = await handleError(() => probeWithRetry(url));
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

  // ── Step 2a: Password login ───────────────────────────────────────────────
  async function handlePasswordLogin() {
    setLoading(true);
    await handleError(async () => {
      const token = await login(urlRef.current, password.trim());
      await completeLogin(urlRef.current, token);
    });
    setLoading(false);
  }

  // ── Step 2b: OpenID login ─────────────────────────────────────────────────
  async function handleOpenIdLogin() {
    setLoading(true);
    await handleError(async () => {
      const serverUrlValue = urlRef.current;
      const appScheme = "actualbudget";
      const serverHostname = new URL(serverUrlValue).hostname;
      const returnUrl = `${appScheme}://${serverHostname}`;
      const callbackUrl = `${returnUrl}/openid-cb`;

      const authUrl = await initiateOpenIdLogin(serverUrlValue, returnUrl);
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

      await completeLogin(serverUrlValue, token);
    });
    setLoading(false);
  }

  function handleChangeServer() {
    setStep("idle");
    setPasswordState("");
    dismissError();
  }

  return {
    serverUrl,
    password,
    step,
    loading,
    error,
    isServerLocked,
    setServerUrl,
    setPassword,
    handleProbe,
    handlePasswordLogin,
    handleOpenIdLogin,
    handleChangeServer,
    dismissError,
  };
}
