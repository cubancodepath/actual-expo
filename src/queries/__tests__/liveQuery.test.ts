import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../db", () => ({
  runQuery: vi.fn(),
}));

import { runQuery } from "../../db";
import { liveQuery } from "../liveQuery";
import { emit } from "../../sync/syncEvents";
import { q } from "../query";

const mockRunQuery = vi.mocked(runQuery);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("liveQuery", () => {
  it("executes query on creation and calls onData", async () => {
    mockRunQuery.mockResolvedValueOnce([
      { id: "cat1", name: "Food", hidden: 0, tombstone: 0, sort_order: 0, cat_group: "g1", goal_def: null },
      { id: "cat2", name: "Gas", hidden: 0, tombstone: 0, sort_order: 1, cat_group: "g1", goal_def: null },
    ]);

    const onData = vi.fn();
    const live = liveQuery(q("categories").select(["id", "name"]), { onData });

    // Wait for async run() to complete
    await vi.waitFor(() => expect(onData).toHaveBeenCalled());

    expect(onData).toHaveBeenCalledTimes(1);
    expect(onData.mock.calls[0][0]).toHaveLength(2);

    live.unsubscribe();
  });

  it("optimisticUpdate updates data and calls onData without re-querying", async () => {
    mockRunQuery.mockResolvedValueOnce([
      { id: "cat1", name: "Food", hidden: 0, tombstone: 0, sort_order: 0, cat_group: "g1", goal_def: null },
    ]);

    const onData = vi.fn();
    const live = liveQuery(q("categories").select(["id", "name"]), { onData });

    await vi.waitFor(() => expect(onData).toHaveBeenCalledTimes(1));

    // Optimistic update — no DB call
    const callsBefore = mockRunQuery.mock.calls.length;
    live.optimisticUpdate((data) => data.map((d) => ({ ...d, name: "Updated" })));

    expect(onData).toHaveBeenCalledTimes(2);
    expect(mockRunQuery.mock.calls.length).toBe(callsBefore); // No new DB call

    live.unsubscribe();
  });

  it("auto-refreshes when queryRegistry notifies for matching datasets", async () => {
    mockRunQuery
      .mockResolvedValueOnce([{ id: "cat1", name: "Food", hidden: 0, tombstone: 0, sort_order: 0, cat_group: "g1", goal_def: null }])
      .mockResolvedValueOnce([
        { id: "cat1", name: "Food", hidden: 0, tombstone: 0, sort_order: 0, cat_group: "g1", goal_def: null },
        { id: "cat2", name: "Gas", hidden: 0, tombstone: 0, sort_order: 1, cat_group: "g1", goal_def: null },
      ]);

    const onData = vi.fn();
    const live = liveQuery(q("categories"), { onData });

    await vi.waitFor(() => expect(onData).toHaveBeenCalledTimes(1));

    // Simulate a mutation that touches "categories" dataset
    emit({ type: "applied", tables: ["categories"] });

    await vi.waitFor(() => expect(onData).toHaveBeenCalledTimes(2));
    expect(onData.mock.calls[1][0]).toHaveLength(2); // second call has 2 items

    live.unsubscribe();
  });

  it("unsubscribe stops further notifications", async () => {
    mockRunQuery.mockResolvedValue([]);

    const onData = vi.fn();
    const live = liveQuery(q("categories"), { onData });

    await vi.waitFor(() => expect(onData).toHaveBeenCalledTimes(1));

    live.unsubscribe();

    // This should NOT trigger a refresh
    emit({ type: "applied", tables: ["categories"] });

    // Give it time — onData should not be called again
    await new Promise((r) => setTimeout(r, 50));
    expect(onData).toHaveBeenCalledTimes(1);
  });
});
