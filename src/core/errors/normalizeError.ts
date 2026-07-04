import { ActualError } from "./ActualError";
import { PostError } from "./PostError";
import { SyncError } from "./SyncError";

/**
 * Normalize anything thrown into an ActualError. Producers are expected to
 * throw ActualError directly (services/sync do); this only exists to catch
 * what slips through — legacy PostError/SyncError instances during the
 * migration window, and truly foreign errors (native modules, JSON.parse).
 */
export function normalizeError(e: unknown): ActualError {
  if (e instanceof ActualError) return e;

  // Legacy — deleted once every producer throws ActualError directly.
  if (e instanceof PostError) {
    switch (e.type) {
      case "network-failure":
        return new ActualError("network/offline", { cause: e });
      case "invalid-password":
        return new ActualError("auth/invalid-password", { cause: e });
      case "unauthorized":
      case "token-expired":
        return new ActualError("auth/token-expired", { cause: e });
      case "parse-json":
        return new ActualError("http/parse-error", { cause: e });
      default:
        return new ActualError("http/server-error", {
          cause: e,
          context: { serverReason: e.type },
        });
    }
  }

  if (e instanceof SyncError) {
    const meta = e.meta as { isMissingKey?: boolean; keyRotated?: boolean } | undefined;
    if (meta?.isMissingKey) {
      return new ActualError("sync/key-missing", {
        cause: e,
        context: { keyRotated: meta.keyRotated },
      });
    }
    switch (e.type) {
      case "clock-drift":
        return new ActualError("sync/clock-drift", { cause: e });
      case "out-of-sync":
        return new ActualError("sync/out-of-sync", { cause: e });
      case "invalid-schema":
        return new ActualError("sync/invalid-schema", { cause: e });
      case "encrypt-failure":
        return new ActualError("sync/encrypt-failure", { cause: e });
      case "decrypt-failure":
        return new ActualError("sync/decrypt-failure", { cause: e });
      default:
        return new ActualError("sync/out-of-sync", { cause: e });
    }
  }

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
