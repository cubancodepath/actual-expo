import type { ErrorCode } from "./codes";

export type ErrorDisplay = "silent" | "toast" | "inline" | "dialog" | "fatal";

export type ErrorPolicy = {
  /** Whether reportError should send this to Sentry. */
  sentry: boolean;
  display: ErrorDisplay;
  /** Side effect the pipeline runs in addition to displaying the error. */
  action?: "redirect-login" | "logout";
};

/**
 * One row per ErrorCode. `satisfies` (not `as`) keeps this a plain object
 * literal while making a missing/extra code a compile error — the single
 * place that decides how an error surfaces, instead of that decision living
 * inside whichever screen happened to catch it.
 */
export const ERROR_POLICY = {
  "network/offline": { sentry: false, display: "silent" },
  "network/timeout": { sentry: false, display: "toast" },
  "http/server-error": { sentry: true, display: "toast" },
  "http/parse-error": { sentry: true, display: "toast" },
  "http/rejected": { sentry: true, display: "toast" },

  "auth/unauthorized": { sentry: false, display: "silent", action: "redirect-login" },
  "auth/token-expired": { sentry: false, display: "silent", action: "redirect-login" },
  "auth/invalid-password": { sentry: false, display: "inline" },

  "sync/clock-drift": { sentry: true, display: "toast" },
  "sync/out-of-sync": { sentry: true, display: "toast" },
  "sync/invalid-schema": { sentry: true, display: "toast" },
  "sync/encrypt-failure": { sentry: true, display: "dialog" },
  "sync/decrypt-failure": { sentry: true, display: "dialog" },
  "sync/key-missing": { sentry: false, display: "dialog" },

  "file/upload-failed": { sentry: true, display: "inline" },
  "file/download-failed": { sentry: true, display: "inline" },
  "file/corrupt-archive": { sentry: true, display: "dialog" },
  "file/delete-failed": { sentry: true, display: "toast" },
  "file/switch-failed": { sentry: true, display: "dialog" },

  "db/unavailable": { sentry: true, display: "dialog" },
  "unknown/unexpected": { sentry: true, display: "toast" },
  "unknown/fatal": { sentry: true, display: "fatal" },
} satisfies Record<ErrorCode, ErrorPolicy>;

export function policyFor(code: ErrorCode): ErrorPolicy {
  return ERROR_POLICY[code];
}
