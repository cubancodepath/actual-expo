import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  getLatestTransaction: vi.fn(),
  listeners: [] as Array<(event: { type: string }) => void>,
}));

vi.mock("@/core/server/transactions", () => ({
  getLatestTransaction: mocks.getLatestTransaction,
}));

vi.mock("@/core/sync/syncEvents", () => ({
  listen: (cb: (event: { type: string }) => void) => {
    mocks.listeners.push(cb);
    return () => {};
  },
}));

import { fetchLatestTransactionDate, __resetTransactionBoundsCache } from "../transactionBounds";

function emit(type: string) {
  for (const cb of mocks.listeners) cb({ type });
}

describe("fetchLatestTransactionDate", () => {
  beforeEach(() => {
    __resetTransactionBoundsCache();
    mocks.getLatestTransaction.mockReset();
  });

  it("shares one fetch across callers for the same budget", async () => {
    mocks.getLatestTransaction.mockResolvedValue({ date: "2026-07-01" });

    const [a, b] = await Promise.all([
      fetchLatestTransactionDate("b1"),
      fetchLatestTransactionDate("b1"),
    ]);

    expect(a).toBe("2026-07-01");
    expect(b).toBe("2026-07-01");
    expect(mocks.getLatestTransaction).toHaveBeenCalledTimes(1);
  });

  it("refetches when the budget changes", async () => {
    mocks.getLatestTransaction.mockResolvedValueOnce({ date: "2026-07-01" });
    mocks.getLatestTransaction.mockResolvedValueOnce({ date: "2026-01-15" });

    expect(await fetchLatestTransactionDate("b1")).toBe("2026-07-01");
    expect(await fetchLatestTransactionDate("b2")).toBe("2026-01-15");
    expect(mocks.getLatestTransaction).toHaveBeenCalledTimes(2);
  });

  it("falls back to today when the budget has no transactions", async () => {
    mocks.getLatestTransaction.mockResolvedValue(null);

    const date = await fetchLatestTransactionDate("b1");

    expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("invalidates on applied sync events, ignores other events", async () => {
    mocks.getLatestTransaction.mockResolvedValue({ date: "2026-07-01" });

    await fetchLatestTransactionDate("b1");
    emit("start");
    await fetchLatestTransactionDate("b1");
    expect(mocks.getLatestTransaction).toHaveBeenCalledTimes(1);

    emit("applied");
    await fetchLatestTransactionDate("b1");
    expect(mocks.getLatestTransaction).toHaveBeenCalledTimes(2);
  });
});
