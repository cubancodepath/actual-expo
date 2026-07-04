export type ErrorCode =
  // network / transport
  | "network/offline"
  | "network/timeout"
  | "http/server-error"
  | "http/parse-error"
  | "http/rejected"
  // auth
  | "auth/unauthorized"
  | "auth/token-expired"
  | "auth/invalid-password"
  // sync
  | "sync/clock-drift"
  | "sync/out-of-sync"
  | "sync/invalid-schema"
  | "sync/encrypt-failure"
  | "sync/decrypt-failure"
  | "sync/key-missing"
  // budget files
  | "file/upload-failed"
  | "file/download-failed"
  | "file/corrupt-archive"
  | "file/delete-failed"
  | "file/switch-failed"
  // infra
  | "db/unavailable"
  | "unknown/unexpected"
  | "unknown/fatal";

export type RecoveryAction = "retry" | "login" | "dismiss" | "reopen" | "none";

type CodeMeta = {
  /** i18n key under the "errors" namespace, translated at render time. */
  messageKey: string;
  recovery: RecoveryAction;
  /** English fallback for Error.message (Sentry/logs) — never shown to users. */
  debugMessage: string;
};

export const CODE_META: Record<ErrorCode, CodeMeta> = {
  "network/offline": {
    messageKey: "errors:networkFailure",
    recovery: "retry",
    debugMessage: "Network unreachable",
  },
  "network/timeout": {
    messageKey: "errors:timeout",
    recovery: "retry",
    debugMessage: "Request timed out",
  },
  "http/server-error": {
    messageKey: "errors:serverError",
    recovery: "retry",
    debugMessage: "Server returned an error response",
  },
  "http/parse-error": {
    messageKey: "errors:serverError",
    recovery: "retry",
    debugMessage: "Failed to parse server response",
  },
  "http/rejected": {
    messageKey: "errors:serverRejected",
    recovery: "dismiss",
    debugMessage: "Server rejected the request",
  },
  "auth/unauthorized": {
    messageKey: "errors:sessionExpired",
    recovery: "login",
    debugMessage: "Request unauthorized",
  },
  "auth/token-expired": {
    messageKey: "errors:sessionExpired",
    recovery: "login",
    debugMessage: "Auth token expired",
  },
  "auth/invalid-password": {
    messageKey: "errors:invalidPassword",
    recovery: "dismiss",
    debugMessage: "Invalid password",
  },
  "sync/clock-drift": {
    messageKey: "errors:clockDrift",
    recovery: "retry",
    debugMessage: "Device clock drifted too far from server time",
  },
  "sync/out-of-sync": {
    messageKey: "errors:outOfSync",
    recovery: "retry",
    debugMessage: "Merkle tree did not converge after retry",
  },
  "sync/invalid-schema": {
    messageKey: "errors:invalidSchema",
    recovery: "retry",
    debugMessage: "Sync message referenced an unknown table/column",
  },
  "sync/encrypt-failure": {
    messageKey: "errors:encryptFailed",
    recovery: "retry",
    debugMessage: "Failed to encrypt outgoing sync message",
  },
  "sync/decrypt-failure": {
    messageKey: "errors:decryptFailed",
    recovery: "retry",
    debugMessage: "Failed to decrypt incoming sync message",
  },
  "sync/key-missing": {
    messageKey: "errors:encryptionKeyMissing",
    recovery: "reopen",
    debugMessage: "Encryption key is missing or was rotated",
  },
  "file/upload-failed": {
    messageKey: "errors:uploadFailed",
    recovery: "retry",
    debugMessage: "Failed to upload budget file",
  },
  "file/download-failed": {
    messageKey: "errors:downloadFailed",
    recovery: "retry",
    debugMessage: "Failed to download budget file",
  },
  "file/corrupt-archive": {
    messageKey: "errors:corruptArchive",
    recovery: "dismiss",
    debugMessage: "Downloaded archive is not a valid budget file",
  },
  "file/delete-failed": {
    messageKey: "errors:deleteFailed",
    recovery: "retry",
    debugMessage: "Failed to delete budget file",
  },
  "file/switch-failed": {
    messageKey: "errors:switchFailed",
    recovery: "retry",
    debugMessage: "Failed to switch active budget",
  },
  "db/unavailable": {
    messageKey: "errors:databaseUnavailable",
    recovery: "dismiss",
    debugMessage: "Database connection unavailable",
  },
  "unknown/unexpected": {
    messageKey: "errors:unexpectedError",
    recovery: "dismiss",
    debugMessage: "Unexpected error",
  },
  "unknown/fatal": {
    messageKey: "errors:fatalBody",
    recovery: "none",
    debugMessage: "Fatal render error",
  },
};
