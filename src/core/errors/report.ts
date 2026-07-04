import { ActualError } from "./ActualError";
import { normalizeError } from "./normalizeError";
import { policyFor } from "./policy";

export type ReportOptions = {
  /** Extra data merged into the error's Sentry context. */
  context?: Record<string, unknown>;
  /**
   * The catcher already displays this error itself (e.g. a mutation with
   * `meta.inline`) — the sink should still log it, just skip presentation.
   */
  inlineHandled?: boolean;
};

export type ReportedError = {
  error: ActualError;
  display: ReturnType<typeof policyFor>["display"];
  action: ReturnType<typeof policyFor>["action"];
  sentry: boolean;
};

type ErrorSink = (reported: ReportedError) => void;

let sink: ErrorSink | null = null;

// Errors reported before installErrorPipeline() runs (module-init throws,
// very early bootstrap) aren't lost — they're replayed once the sink installs.
const preInstallBuffer: ReportedError[] = [];
const PRE_INSTALL_BUFFER_CAP = 20;

export function setErrorSink(next: ErrorSink): void {
  sink = next;
  while (preInstallBuffer.length > 0) {
    sink(preInstallBuffer.shift()!);
  }
}

/**
 * The single choke point for surfacing an error to the user. Normalizes
 * whatever was thrown, looks up its policy, and hands it to the installed
 * sink (Sentry + errorStore). Safe to call from anywhere — React event
 * handlers, fullSync's catch, the global error handler.
 */
export function reportError(e: unknown, options: ReportOptions = {}): ActualError {
  const normalized = normalizeError(e);
  const error = options.context
    ? new ActualError(normalized.code, {
        params: normalized.messageParams,
        cause: normalized.cause,
        context: { ...normalized.context, ...options.context },
      })
    : normalized;
  const policy = policyFor(error.code);

  const reported: ReportedError = {
    error,
    display: options.inlineHandled ? "silent" : policy.display,
    action: policy.action,
    sentry: policy.sentry,
  };

  if (sink) {
    sink(reported);
  } else {
    preInstallBuffer.push(reported);
    if (preInstallBuffer.length > PRE_INSTALL_BUFFER_CAP) preInstallBuffer.shift();
  }

  return error;
}
