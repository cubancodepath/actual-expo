import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/core/server/db", () => {
  // The reactive layer runs through aqlQuery → db.all (alias of runQuery), so
  // `all` must be the SAME mock fn the tests drive via `mockRunQuery`.
  const runQuery = vi.fn();
  return { runQuery, all: runQuery };
});

import { runQuery } from "@/core/server/db";
import { liveQuery } from "../liveQuery";
import { pagedQuery } from "../pagedQuery";
import { emit } from "@/core/server/sync/syncEvents";
import { q } from "@/core/shared/query";

const mockRunQuery = vi.mocked(runQuery);

type Row = {
  id: string;
  name: string;
  hidden: number;
  tombstone: number;
  sort_order: number;
  cat_group: string;
  goal_def: null;
};

function makeRow(id: string, name: string, sort_order = 0): Row {
  return {
    id,
    name,
    hidden: 0,
    tombstone: 0,
    sort_order,
    cat_group: "g1",
    goal_def: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("liveQuery/pagedQuery invalidation coalescing", () => {
  it("liveQuery: 3 synchronous applied events collapse into ONE additional executeQuery", async () => {
    // Auto-start run() resolves immediately.
    mockRunQuery.mockResolvedValueOnce([makeRow("cat1", "Food")]);

    const onData = vi.fn();
    const live = liveQuery<Row>(q("categories"), { onData });

    await vi.waitFor(() => expect(onData).toHaveBeenCalledTimes(1));
    const callsAfterInit = mockRunQuery.mock.calls.length;

    // Queue the response for the coalesced re-run.
    mockRunQuery.mockResolvedValueOnce([makeRow("cat1", "Food"), makeRow("cat2", "Gas")]);

    // Fire 3 "applied" events synchronously (same JS task) — should collapse
    // into a single scheduled run().
    emit({ type: "applied", tables: ["categories"] });
    emit({ type: "applied", tables: ["categories"] });
    emit({ type: "applied", tables: ["categories"] });

    // No new run yet — scheduling uses setTimeout(0), not synchronous.
    expect(mockRunQuery.mock.calls.length).toBe(callsAfterInit);

    await vi.runAllTimersAsync();

    // Exactly ONE additional executeQuery call for the whole burst.
    expect(mockRunQuery.mock.calls.length).toBe(callsAfterInit + 1);
    expect(onData).toHaveBeenCalledTimes(2);
    expect(onData.mock.calls[1][0]).toHaveLength(2);

    live.unsubscribe();
  });

  it("liveQuery: unsubscribe before the scheduled timer fires cancels the run", async () => {
    mockRunQuery.mockResolvedValueOnce([makeRow("cat1", "Food")]);

    const onData = vi.fn();
    const live = liveQuery<Row>(q("categories"), { onData });

    await vi.waitFor(() => expect(onData).toHaveBeenCalledTimes(1));
    const callsAfterInit = mockRunQuery.mock.calls.length;

    emit({ type: "applied", tables: ["categories"] });
    live.unsubscribe();

    await vi.runAllTimersAsync();

    // No re-run happened — call count unchanged, onData not called again.
    expect(mockRunQuery.mock.calls.length).toBe(callsAfterInit);
    expect(onData).toHaveBeenCalledTimes(1);
  });

  it("liveQuery: optimisticUpdate followed by an applied event still runs the authoritative re-run", async () => {
    mockRunQuery.mockResolvedValueOnce([makeRow("cat1", "Food")]);

    const onData = vi.fn();
    const live = liveQuery<Row>(q("categories"), { onData });

    await vi.waitFor(() => expect(onData).toHaveBeenCalledTimes(1));

    // Optimistic update — no DB call, bumps inflightId.
    live.optimisticUpdate((data) => [...data, makeRow("cat-optimistic", "Optimistic")]);
    expect(onData).toHaveBeenCalledTimes(2);
    expect(live.data).toHaveLength(2);

    // An "applied" event follows — the authoritative re-run must still
    // happen (coalescing must not delay/drop it) and overwrite optimistic data.
    mockRunQuery.mockResolvedValueOnce([makeRow("cat1", "Food")]);
    emit({ type: "applied", tables: ["categories"] });

    await vi.runAllTimersAsync();

    expect(onData).toHaveBeenCalledTimes(3);
    expect(live.data).toHaveLength(1);
    expect(live.data[0]?.id).toBe("cat1");

    live.unsubscribe();
  });

  it("pagedQuery: 3 synchronous applied events collapse into ONE executeQuery + ONE executeCount", async () => {
    mockRunQuery
      .mockResolvedValueOnce([makeRow("t1", "Row1")]) // executeQuery
      .mockResolvedValueOnce([{ count: 1 }] as unknown as Row[]); // executeCount

    const onData = vi.fn();
    const paged = pagedQuery<Row>(q("transactions"), { onData, pageCount: 50 });

    await vi.waitFor(() => expect(onData).toHaveBeenCalledTimes(1));
    const callsAfterInit = mockRunQuery.mock.calls.length;

    mockRunQuery
      .mockResolvedValueOnce([makeRow("t1", "Row1"), makeRow("t2", "Row2")])
      .mockResolvedValueOnce([{ count: 2 }] as unknown as Row[]);

    emit({ type: "applied", tables: ["transactions"] });
    emit({ type: "applied", tables: ["transactions"] });
    emit({ type: "applied", tables: ["transactions"] });

    expect(mockRunQuery.mock.calls.length).toBe(callsAfterInit);

    await vi.runAllTimersAsync();

    // Exactly one additional executeQuery + one executeCount for the burst.
    expect(mockRunQuery.mock.calls.length).toBe(callsAfterInit + 2);
    expect(onData).toHaveBeenCalledTimes(2);
    expect(paged.data).toHaveLength(2);

    paged.unsubscribe();
  });
});
