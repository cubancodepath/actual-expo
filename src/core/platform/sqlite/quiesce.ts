// Safe-close bookkeeping for drivers whose native work outlives the JS call.
//
// expo-sqlite dispatches every async statement onto a CONCURRENT queue
// (expo.module.sqlite.AsyncQueue). Closing the connection while a statement is
// mid-flight frees the sqlite3* between two of its steps (prepare → step →
// reset → finalize), and the statement then resets a dangling pointer:
// EXC_BAD_ACCESS on that queue. Nulling our handle first only stops statements
// that haven't started — it can't wait for the ones already dispatched.
//
// So the driver's close() must wait for its own in-flight work. That's a
// property of the DRIVER, not of the engine above it, which is why this lives
// in the platform seam and `core/server/db` stays untouched (and upstream-
// shaped: loot-core runs better-sqlite3 synchronously and never sees this).
//
// Driver-agnostic on purpose — it knows nothing about expo-sqlite, so it can
// be unit-tested without the native module.

const CLOSED_MESSAGE = "Database is closed";

export interface Quiescer {
  /**
   * Run an async native call, keeping `close()` waiting until it settles.
   * Rejects instead of touching the driver once closing has begun.
   */
  track<T>(fn: () => Promise<T>): Promise<T>;
  /** Guard a synchronous native call. Throws once closing has begun. */
  assertOpen(): void;
  /**
   * Begin closing: reject further calls, wait for in-flight work to settle,
   * then run `closeNative`. Idempotent — later calls await the first one.
   */
  close(closeNative: () => Promise<void>): Promise<void>;
}

export function createQuiescer(): Quiescer {
  const inflight = new Set<Promise<unknown>>();
  let closing: Promise<void> | null = null;

  function assertOpen(): void {
    if (closing) throw new Error(CLOSED_MESSAGE);
  }

  return {
    assertOpen,

    track<T>(fn: () => Promise<T>): Promise<T> {
      // Rejected promise, not a synchronous throw: these methods are declared
      // async, so a caller may only have attached `.catch()`.
      if (closing) return Promise.reject(new Error(CLOSED_MESSAGE));
      const p = fn();
      inflight.add(p);
      // Detach the bookkeeping from the caller's chain: `finally` here must not
      // turn into an unhandled rejection of its own, and the caller still sees
      // the original promise (and its rejection).
      void p.then(
        () => inflight.delete(p),
        () => inflight.delete(p),
      );
      return p;
    },

    close(closeNative: () => Promise<void>): Promise<void> {
      if (closing) return closing;
      closing = (async () => {
        // Terminates: `track` rejects once `closing` is set, so the set can
        // only shrink from here. The loop is just belt-and-braces against a
        // straggler registered in the same tick the close began.
        while (inflight.size > 0) {
          await Promise.allSettled(inflight);
        }
        await closeNative();
      })();
      return closing;
    },
  };
}
