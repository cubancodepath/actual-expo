import i18n from "../i18n/config";
import { PostError } from "./PostError";
import { SyncError } from "./SyncError";
import type { AppError } from "./AppError";

function t(key: string): string {
  return i18n.t(key as any) as string;
}

export function toAppError(e: unknown): AppError {
  // PostError (from src/post.ts)
  if (e instanceof PostError) {
    switch (e.type) {
      case "network-failure":
        return { category: "network", message: t("errors:networkFailure"), recovery: "retry", cause: e };
      case "unauthorized":
      case "token-expired":
        return { category: "auth", message: t("errors:sessionExpired"), recovery: "login", cause: e };
      case "internal":
        return { category: "unknown", message: t("errors:serverError"), recovery: "retry", cause: e };
      case "parse-json":
        return { category: "unknown", message: t("errors:serverError"), recovery: "retry", cause: e };
      default:
        return { category: "unknown", message: t("errors:unexpectedError"), recovery: "dismiss", cause: e };
    }
  }

  // SyncError (from sync/encoder.ts)
  if (e instanceof SyncError) {
    const meta = e.meta as { isMissingKey?: boolean } | undefined;
    if (meta?.isMissingKey) {
      return {
        category: "encryption",
        message: t("errors:encryptionKeyMissing"),
        recovery: "reopen",
        cause: e,
      };
    }
    return { category: "sync", message: t("errors:syncFailed"), recovery: "retry", cause: e };
  }

  // Standard Error with recognizable patterns
  if (e instanceof Error) {
    const msg = e.message.toLowerCase();

    if (msg.includes("network") || msg.includes("fetch") || msg.includes("timeout")) {
      return { category: "network", message: t("errors:networkFailure"), recovery: "retry", cause: e };
    }

    if (msg.includes("closed resource") || msg.includes("not initialized")) {
      return { category: "database", message: t("errors:databaseUnavailable"), recovery: "dismiss", cause: e };
    }
  }

  // Fallback
  return { category: "unknown", message: t("errors:unexpectedError"), recovery: "dismiss", cause: e };
}
