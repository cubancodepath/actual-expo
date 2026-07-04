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
import { reportError } from "@/core/errors";

export type LoginStep = "idle" | "probing" | LoginMethod;

export interface UseLoginFlowReturn {
  serverUrl: string;
  password: string;
  step: LoginStep;
  loading: boolean;
  /** Validation message (empty URL, no OpenID token) — not a reported error. */
  validationMessage: string | null;
  /** Set when a probe/login call fails with something worth showing inline. */
  error: unknown;
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
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);

  const urlRef = useRef("");

  const isServerLocked = step !== "idle" && step !== "probing";

  function dismissError() {
    setValidationMessage(null);
    setError(null);
  }

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

  /**
   * Reports the error to the pipeline (Sentry/breadcrumbs) but keeps display
   * local to this screen — except network failures, which stay silent here
   * (matches network/offline's policy; probing quietly resets instead of
   * showing a banner).
   */
  function handleLoginError(e: unknown) {
    const normalized = reportError(e, { inlineHandled: true });
    if (normalized.code !== "network/offline") {
      setError(e);
    }
  }

  // ── Step 1: Probe server ──────────────────────────────────────────────────
  async function handleProbe() {
    const url = serverUrl.trim().replace(/\/$/, "");
    if (!url) {
      setValidationMessage(t("serverUrlRequired"));
      return;
    }

    setStep("probing");
    dismissError();
    try {
      // getBootstrapInfo retries with backoff internally (see authService)
      const info = await getBootstrapInfo(url);
      urlRef.current = url;
      if (!info.bootstrapped) {
        setValidationMessage(t("serverNotSetUp"));
        setStep("idle");
        return;
      }
      setStep(info.loginMethod);
    } catch (e) {
      handleLoginError(e);
      setStep("idle");
    }
  }

  // ── Step 2a: Password login ───────────────────────────────────────────────
  async function handlePasswordLogin() {
    setLoading(true);
    dismissError();
    try {
      const token = await login(urlRef.current, password.trim());
      await completeLogin(urlRef.current, token);
    } catch (e) {
      handleLoginError(e);
    }
    setLoading(false);
  }

  // ── Step 2b: OpenID login ─────────────────────────────────────────────────
  async function handleOpenIdLogin() {
    setLoading(true);
    dismissError();
    try {
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
        setValidationMessage(t("openIdNoToken"));
        setLoading(false);
        return;
      }

      await completeLogin(serverUrlValue, token);
    } catch (e) {
      handleLoginError(e);
    }
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
    validationMessage,
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
