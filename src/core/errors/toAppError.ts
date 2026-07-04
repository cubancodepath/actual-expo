import i18n from "@/i18n/config";
import { normalizeError } from "./normalizeError";
import type { ErrorCode } from "./codes";
import type { AppError, ErrorCategory } from "./AppError";

function t(key: string, params?: Record<string, string | number>): string {
  return i18n.t(key as never, params as never) as unknown as string;
}

function categoryFor(code: ErrorCode): ErrorCategory {
  if (code === "auth/invalid-password") return "validation";
  if (code === "sync/key-missing") return "encryption";
  if (code === "db/unavailable") return "database";
  if (code.startsWith("network/")) return "network";
  if (code.startsWith("auth/")) return "auth";
  if (code.startsWith("sync/")) return "sync";
  return "unknown";
}

/**
 * @deprecated Use `normalizeError`/`reportError` instead. Kept as a thin
 * adapter over the new ActualError model so consumers not yet migrated to
 * the pipeline (see plan commits 6-8) still get a correct category/message
 * for errors thrown by already-migrated producers.
 */
export function toAppError(e: unknown): AppError {
  const error = normalizeError(e);
  return {
    category: categoryFor(error.code),
    message: t(error.messageKey, error.messageParams),
    recovery: error.recovery,
    cause: error.cause ?? error,
  };
}
