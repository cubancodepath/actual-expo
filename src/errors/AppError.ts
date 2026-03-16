export type ErrorCategory =
  | "network"
  | "auth"
  | "validation"
  | "sync"
  | "encryption"
  | "database"
  | "unknown";

export type RecoveryAction =
  | "retry"
  | "login"
  | "dismiss"
  | "reopen"
  | "none";

export type AppError = {
  /** Machine-readable category for display strategy decisions */
  category: ErrorCategory;
  /** User-friendly, localized message */
  message: string;
  /** What the user can do about it */
  recovery: RecoveryAction;
  /** Original error for logging/Sentry */
  cause?: unknown;
};
