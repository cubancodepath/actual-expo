import type { ErrorCode } from "./codes";

type ActualErrorOptions = {
  /** Human-oriented debug message (NOT user-facing — UI translates from `code`). */
  message?: string;
  /** Extra data attached by the thrower (surfaced in logs/Sentry by the app). */
  context?: Record<string, unknown>;
  cause?: unknown;
};

/**
 * The one error class core throws for anything a user can hit: transport,
 * sync, files, auth. Carries only a typed `code` — how to present or react
 * to it (i18n message, retry, logout…) is the app's decision, not core's.
 */
export class ActualError extends Error {
  readonly code: ErrorCode;
  readonly context?: Record<string, unknown>;

  constructor(code: ErrorCode, options: ActualErrorOptions = {}) {
    super(options.message ?? code, { cause: options.cause });
    this.name = "ActualError";
    this.code = code;
    this.context = options.context;
  }
}
