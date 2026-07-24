import { describe, it, expect, afterEach, vi } from "vitest";
import { openTestDb, closeTestDb } from "@/core/db/__tests__/testDb";
import { sendMessages, resetBatchState } from "@/core/sync/batch";
import { setSyncingMode } from "@/core/sync/syncMode";
import { getSyncTimeout, clearSyncTimeout } from "@/core/sync/lifecycle";
import { Timestamp } from "@/core/crdt";

const mocks = vi.hoisted(() => ({ fullSync: vi.fn(async () => 0) }));
vi.mock("@/core/sync/fullSync", () => ({
  fullSync: mocks.fullSync,
  clearActiveSyncPromise: () => {},
}));

describe("scheduleFullSync gate — skips scheduling while offline/disabled (Phase 3.4)", () => {
  afterEach(async () => {
    setSyncingMode("enabled");
    resetBatchState();
    if (getSyncTimeout()) clearSyncTimeout();
    await closeTestDb();
  });

  it("schedules a full sync after a mutation when enabled", async () => {
    await openTestDb();
    await sendMessages([
      {
        timestamp: Timestamp.send()!,
        dataset: "accounts",
        row: "acc1",
        column: "name",
        value: "Checking",
      },
    ]);
    expect(getSyncTimeout()).not.toBeNull();
  });

  it("does not schedule a full sync while offline", async () => {
    await openTestDb();
    setSyncingMode("offline");
    await sendMessages([
      {
        timestamp: Timestamp.send()!,
        dataset: "accounts",
        row: "acc1",
        column: "name",
        value: "Checking",
      },
    ]);
    expect(getSyncTimeout()).toBeNull();
  });

  it("the scheduled callback runs core fullSync once, coalescing bursts", async () => {
    await openTestDb();
    mocks.fullSync.mockClear();
    vi.useFakeTimers();
    try {
      const msg = (row: string) => ({
        timestamp: Timestamp.send()!,
        dataset: "accounts",
        row,
        column: "name",
        value: "x",
      });
      // Three mutations in a burst — trailing debounce means ONE sync.
      await sendMessages([msg("a1")]);
      await sendMessages([msg("a2")]);
      await sendMessages([msg("a3")]);

      await vi.advanceTimersByTimeAsync(1000);
      expect(mocks.fullSync).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not schedule a full sync while disabled", async () => {
    await openTestDb();
    setSyncingMode("disabled");
    await sendMessages([
      {
        timestamp: Timestamp.send()!,
        dataset: "accounts",
        row: "acc1",
        column: "name",
        value: "Checking",
      },
    ]);
    expect(getSyncTimeout()).toBeNull();
  });
});
