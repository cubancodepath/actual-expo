import { emitErrorEvent } from "./ErrorChannel";

/**
 * Chains onto ErrorUtils' existing global handler (Sentry.init already
 * installed one) so truly uncaught errors also reach the error bus —
 * without it, an escaped throw crashes silently past our whole system.
 *
 * Deliberately does NOT touch Hermes' unhandled-promise-rejection tracker:
 * Sentry.init already registers a single onUnhandled callback there, and
 * Hermes only supports one — re-registering would silently replace Sentry's
 * own tracking rather than add to it.
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
    emitErrorEvent(error, { isFatal });
    previousHandler(error, isFatal);
  });
}
