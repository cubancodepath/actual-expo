import { describe, it, expect, vi, beforeEach } from "vitest";

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

describe("liveQuery/pagedQuery initial dependency seeding", () => {
  it("liveQuery: a joined-table event fires a re-run BEFORE the first run() resolves", async () => {
    // `payee.name` is a ref-path that joins in "payees". The compiled dependency
    // set for this query must include that table synchronously, at construction
    // time — not just after the first run() resolves.
    const firstRun = deferred<unknown[]>();
    mockRunQuery.mockImplementationOnce(() => firstRun.promise);

    const onData = vi.fn();
    const live = liveQuery(q("transactions").select(["id", "payee.name"]), { onData });

    // Before the first run() resolves, emit an "applied" event for a table
    // that is ONLY reachable via the join (not the base table).
    emit({ type: "applied", tables: ["payees"] });

    // A second executeQuery (i.e. a second runQuery call) must have been
    // triggered by the event — proving dependencies were seeded with the
    // full compiled set, not just ["transactions"].
    await vi.waitFor(() => expect(mockRunQuery).toHaveBeenCalledTimes(2));

    // Resolve the in-flight call to let the query settle. The event-triggered
    // second run's promise is left unresolved, which is fine — nothing awaits it.
    firstRun.resolve([]);
    await new Promise((r) => setTimeout(r, 0));
    live.unsubscribe();
  });

  it("pagedQuery: a joined-table event fires a re-run BEFORE the first run() resolves", async () => {
    const firstRunQuery = deferred<unknown[]>();
    const firstRunCount = deferred<unknown[]>();
    mockRunQuery.mockImplementationOnce(() => firstRunQuery.promise);
    mockRunQuery.mockImplementationOnce(() => firstRunCount.promise);

    const onData = vi.fn();
    const paged = pagedQuery(q("transactions").select(["id", "payee.name"]), { onData });

    emit({ type: "applied", tables: ["payees"] });

    // Each run() issues executeQuery + executeCount, so a second run means
    // 4 total runQuery calls.
    await vi.waitFor(() => expect(mockRunQuery).toHaveBeenCalledTimes(4));

    firstRunQuery.resolve([]);
    firstRunCount.resolve([{ count: 0 }]);
    await new Promise((r) => setTimeout(r, 0));
    paged.unsubscribe();
  });
});
