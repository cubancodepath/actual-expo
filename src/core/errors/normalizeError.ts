import { ActualError } from "./ActualError";

/**
 * Normalize anything thrown into an ActualError. Producers are expected to
 * throw ActualError directly (services/sync do); this only exists to catch
 * what slips through — truly foreign errors (native modules, JSON.parse,
 * third-party libraries).
 */
export function normalizeError(e: unknown): ActualError {
  if (e instanceof ActualError) return e;

  if (e instanceof Error) {
    const msg = e.message.toLowerCase();
    if (msg.includes("network") || msg.includes("fetch") || msg.includes("timeout")) {
      return new ActualError("network/offline", { cause: e });
    }
    if (msg.includes("closed resource") || msg.includes("not initialized")) {
      return new ActualError("db/unavailable", { cause: e });
    }
  }

  return new ActualError("unknown/unexpected", { cause: e });
}
