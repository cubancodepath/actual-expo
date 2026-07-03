import { describe, it, expect, afterEach } from "vitest";
import { openTestDb, closeTestDb } from "@/core/db/__tests__/testDb";
import { sendMessages, resetBatchState } from "@/core/sync/batch";
import { setSyncingMode } from "@/core/sync/syncMode";
import { getSyncTimeout, clearSyncTimeout } from "@/core/sync/lifecycle";
import { Timestamp } from "@/core/crdt";

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
