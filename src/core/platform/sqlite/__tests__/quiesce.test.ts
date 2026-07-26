import { describe, expect, it, vi } from "vitest";

import { createQuiescer } from "../quiesce";

/** A promise plus its resolver, so a test can hold an "in-flight" native call. */
function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Let pending microtasks run so we can assert a promise has NOT settled. */
const flush = () => new Promise((resolve) => setImmediate(resolve));

describe("createQuiescer", () => {
  it("waits for an in-flight operation before closing the driver", async () => {
    const q = createQuiescer();
    const op = deferred<string>();
    const closeNative = vi.fn(async () => {});

    const tracked = q.track(() => op.promise);
    const closed = q.close(closeNative);
    await flush();

    expect(closeNative).not.toHaveBeenCalled();

    op.resolve("rows");
    await expect(tracked).resolves.toBe("rows");
    await closed;
    expect(closeNative).toHaveBeenCalledTimes(1);
  });

  it("still closes when the in-flight operation fails", async () => {
    const q = createQuiescer();
    const op = deferred<string>();
    const closeNative = vi.fn(async () => {});

    const tracked = q.track(() => op.promise);
    const closed = q.close(closeNative);

    op.reject(new Error("SQL error"));
    await expect(tracked).rejects.toThrow("SQL error");
    await closed;
    expect(closeNative).toHaveBeenCalledTimes(1);
  });

  it("waits for every in-flight operation, not just the first", async () => {
    const q = createQuiescer();
    const slow = deferred<void>();
    const fast = deferred<void>();
    const closeNative = vi.fn(async () => {});

    void q.track(() => fast.promise);
    void q.track(() => slow.promise);
    const closed = q.close(closeNative);

    fast.resolve();
    await flush();
    expect(closeNative).not.toHaveBeenCalled();

    slow.resolve();
    await closed;
    expect(closeNative).toHaveBeenCalledTimes(1);
  });

  it("rejects new work once closing has begun, without touching the driver", async () => {
    const q = createQuiescer();
    const op = deferred<void>();
    const closeNative = vi.fn(async () => {});
    const neverRuns = vi.fn(async () => "rows");

    expect(() => q.assertOpen()).not.toThrow();

    void q.track(() => op.promise);
    const closed = q.close(closeNative);

    // Still draining — the door is already shut for new statements.
    await expect(q.track(neverRuns)).rejects.toThrow("Database is closed");
    expect(() => q.assertOpen()).toThrow("Database is closed");
    expect(neverRuns).not.toHaveBeenCalled();

    op.resolve();
    await closed;
    await expect(q.track(neverRuns)).rejects.toThrow("Database is closed");
    expect(neverRuns).not.toHaveBeenCalled();
  });

  it("closes the driver only once", async () => {
    const q = createQuiescer();
    const closeNative = vi.fn(async () => {});

    await Promise.all([q.close(closeNative), q.close(closeNative)]);
    await q.close(closeNative);

    expect(closeNative).toHaveBeenCalledTimes(1);
  });
});
