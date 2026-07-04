import { CODE_META, type ErrorCode, type RecoveryAction } from "./codes";

type ActualErrorOptions = {
  /** Interpolation params for the i18n message (resolved at render time). */
  params?: Record<string, string | number>;
  /** Extra data attached to Sentry breadcrumbs/context. */
  context?: Record<string, unknown>;
  cause?: unknown;
};

/**
 * The one error class for anything a user can hit: transport, sync, files,
 * auth. Carries an i18n key instead of a translated string so locale changes
 * don't require re-throwing, and so `core/` never imports i18n.
 */
export class ActualError extends Error {
  readonly code: ErrorCode;
  readonly messageKey: string;
  readonly messageParams?: Record<string, string | number>;
  readonly recovery: RecoveryAction;
  readonly context?: Record<string, unknown>;

  constructor(code: ErrorCode, options: ActualErrorOptions = {}) {
    const meta = CODE_META[code];
    super(meta.debugMessage, { cause: options.cause });
    this.name = "ActualError";
    this.code = code;
    this.messageKey = meta.messageKey;
    this.messageParams = options.params;
    this.recovery = meta.recovery;
    this.context = options.context;
  }
}
