import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/core/db", () => ({
  runQuery: vi.fn(),
}));

import { runQuery } from "@/core/db";
import { liveQuery } from "../liveQuery";
import { pagedQuery } from "../pagedQuery";
import { emit } from "../../sync/syncEvents";
import { q } from "../query";

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

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("liveQuery race hardening", () => {
  it("optimisticUpdate invalidates an in-flight run() so stale data cannot clobber it", async () => {
    const initial = deferred<Row[]>();
    mockRunQuery.mockImplementationOnce(() => initial.promise);

    const onData = vi.fn();
    const live = liveQuery<Row>(q("categories").select(["id", "name"]), { onData });

    // Optimistic update fires while the initial run() is still in flight.
    live.optimisticUpdate((data) => [...data, makeRow("cat-optimistic", "Optimistic")]);
    expect(onData).toHaveBeenCalledTimes(1);
    expect(live.data).toHaveLength(1);
    expect(live.data[0]?.id).toBe("cat-optimistic");

    // Now resolve the OLD run() — its response is stale and must be ignored.
    initial.resolve([makeRow("cat1", "Food")]);
    await new Promise((r) => setTimeout(r, 10));

    // onData must not have been called again with the stale pre-optimistic result.
    expect(onData).toHaveBeenCalledTimes(1);
    expect(live.data).toHaveLength(1);
    expect(live.data[0]?.id).toBe("cat-optimistic");

    live.unsubscribe();
  });

  it("fetchNext discards a stale page when a run() resets data meanwhile (pagedQuery)", async () => {
    // Initial run() (auto-start): resolves immediately with page 1 (2 rows).
    mockRunQuery
      .mockResolvedValueOnce([makeRow("t1", "Row1"), makeRow("t2", "Row2")]) // executeQuery
      .mockResolvedValueOnce([{ count: 2 }] as unknown as Row[]); // executeCount

    const onData = vi.fn();
    const paged = pagedQuery<Row>(q("transactions"), { onData, pageCount: 2 });

    await vi.waitFor(() => expect(onData).toHaveBeenCalledTimes(1));
    expect(paged.data).toHaveLength(2);

    // Force hasMore so fetchNext proceeds.
    // (totalCount=2, data.length=2 means hasMore=false by default; bump totalCount via a re-run below.)
    // Instead, set up a scenario: fetchNext is in flight, then a table-change event
    // triggers run() which resets data before fetchNext resolves.

    // Re-run with hasMore=true (simulate 3 total rows, 2 loaded).
    mockRunQuery
      .mockResolvedValueOnce([makeRow("t1", "Row1"), makeRow("t2", "Row2")])
      .mockResolvedValueOnce([{ count: 3 }] as unknown as Row[]);
    emit({ type: "applied", tables: ["transactions"] });
    await vi.waitFor(() => expect(onData).toHaveBeenCalledTimes(2));
    expect(paged.hasMore).toBe(true);

    // Start fetchNext() — its executeQuery call is deferred (unresolved).
    const fetchNextPage = deferred<Row[]>();
    mockRunQuery.mockImplementationOnce(() => fetchNextPage.promise);
    const fetchNextCall = paged.fetchNext();

    // While fetchNext is in flight, a sync event triggers run(), which resets
    // data back to page 1 (2 rows).
    mockRunQuery
      .mockResolvedValueOnce([makeRow("t1", "Row1"), makeRow("t2", "Row2")])
      .mockResolvedValueOnce([{ count: 2 }] as unknown as Row[]);
    emit({ type: "applied", tables: ["transactions"] });
    await vi.waitFor(() => expect(onData).toHaveBeenCalledTimes(3));
    expect(paged.data).toHaveLength(2);

    // Now resolve the stale fetchNext page — it must be discarded.
    fetchNextPage.resolve([makeRow("t3", "Row3")]);
    await fetchNextCall;
    await new Promise((r) => setTimeout(r, 10));

    // Data must equal the reset page 1 (no duplicates, no stale append).
    expect(paged.data).toHaveLength(2);
    expect(paged.data.map((r) => r.id)).toEqual(["t1", "t2"]);

    paged.unsubscribe();
  });

  it("regression: plain sequential run() then fetchNext() still appends normally", async () => {
    mockRunQuery
      .mockResolvedValueOnce([makeRow("t1", "Row1"), makeRow("t2", "Row2")]) // executeQuery
      .mockResolvedValueOnce([{ count: 3 }] as unknown as Row[]); // executeCount

    const onData = vi.fn();
    const paged = pagedQuery<Row>(q("transactions"), { onData, pageCount: 2 });

    await vi.waitFor(() => expect(onData).toHaveBeenCalledTimes(1));
    expect(paged.data).toHaveLength(2);
    expect(paged.hasMore).toBe(true);

    mockRunQuery.mockResolvedValueOnce([makeRow("t3", "Row3")]); // fetchNext page

    await paged.fetchNext();

    expect(paged.data).toHaveLength(3);
    expect(paged.data.map((r) => r.id)).toEqual(["t1", "t2", "t3"]);

    paged.unsubscribe();
  });
});
