import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { listen, emit } from "../../sync/syncEvents";

describe("syncEvents", () => {
  let unsubscribers: Array<() => void> = [];

  afterEach(() => {
    for (const unsub of unsubscribers) unsub();
    unsubscribers = [];
  });

  it("notifies listeners when emit is called", () => {
    const cb = vi.fn();
    unsubscribers.push(listen(cb));

    emit({ type: "applied", tables: ["transactions"] });

    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith({ type: "applied", tables: ["transactions"] });
  });

  it("notifies multiple listeners", () => {
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    unsubscribers.push(listen(cb1));
    unsubscribers.push(listen(cb2));

    emit({ type: "success", tables: ["categories"] });

    expect(cb1).toHaveBeenCalledTimes(1);
    expect(cb2).toHaveBeenCalledTimes(1);
  });

  it("unsubscribe stops notifications", () => {
    const cb = vi.fn();
    const unsub = listen(cb);

    emit({ type: "applied", tables: ["transactions"] });
    expect(cb).toHaveBeenCalledTimes(1);

    unsub();

    emit({ type: "applied", tables: ["transactions"] });
    expect(cb).toHaveBeenCalledTimes(1); // still 1
  });

  it("passes event type correctly", () => {
    const cb = vi.fn();
    unsubscribers.push(listen(cb));

    emit({ type: "applied", tables: ["transactions"] });
    emit({ type: "success", tables: ["categories", "accounts"] });

    expect(cb.mock.calls[0][0].type).toBe("applied");
    expect(cb.mock.calls[1][0].type).toBe("success");
    expect(cb.mock.calls[1][0].tables).toEqual(["categories", "accounts"]);
  });
});
