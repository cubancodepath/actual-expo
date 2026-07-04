import { router } from "expo-router";
import * as Sentry from "@sentry/react-native";
import { reportError, setErrorSink, type ReportedError } from "@/core/errors/report";
import { useErrorStore } from "@/stores/errorStore";
import { usePrefsStore } from "@/stores/prefsStore";

/**
 * Wires reportError()'s output to real side effects: Sentry breadcrumbs/
 * capture, the redirect-login/logout actions, and the global error queue
 * that <ErrorPresenter/> renders. Call once, early in app/_layout.tsx.
 */
export function installErrorPipeline(): void {
  setErrorSink((reported: ReportedError) => {
    const { error, display, action, sentry } = reported;

    Sentry.addBreadcrumb({
      category: "error",
      message: error.message,
      level: "error",
      data: { code: error.code, ...error.context },
    });

    if (sentry) {
      Sentry.captureException(error.cause ?? error, {
        tags: { errorCode: error.code },
        extra: error.context,
      });
    }

    if (action === "redirect-login") {
      usePrefsStore.getState().clearAll();
      router.replace("/(public)/");
    }
    if (action === "logout") {
      usePrefsStore.getState().clearAll();
    }

    if (display === "toast" || display === "inline" || display === "dialog") {
      // "inline" degrades to a toast: nobody handled it locally (no
      // meta.inline mutation caught it), so it still needs *some* surface.
      useErrorStore.getState().push(error, display === "inline" ? "toast" : display);
    } else if (display === "fatal") {
      useErrorStore.getState().push(error, "fatal");
    }
  });
}

/**
 * Chains onto ErrorUtils' existing global handler (Sentry.init already
 * installed one) so truly uncaught errors also flow through reportError —
 * without it, an escaped throw crashes silently past our whole system.
 *
 * Deliberately does NOT touch Hermes' unhandled-promise-rejection tracker:
 * Sentry.init already registers a single onUnhandled callback there, and
 * Hermes only supports one — re-registering would silently replace Sentry's
 * own tracking rather than add to it. Unhandled rejections still reach
 * Sentry directly; they just won't produce a toast via this pipeline.
 */
export function installGlobalHandlers(): void {
  const globalObj = globalThis as {
    ErrorUtils?: {
      getGlobalHandler(): (error: unknown, isFatal?: boolean) => void;
      setGlobalHandler(handler: (error: unknown, isFatal?: boolean) => void): void;
    };
  };
  const errorUtils = globalObj.ErrorUtils;
  if (!errorUtils) return;

  const previousHandler = errorUtils.getGlobalHandler();
  errorUtils.setGlobalHandler((error, isFatal) => {
    reportError(error, { context: { isFatal } });
    previousHandler(error, isFatal);
  });
}
