import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/core/server/db", () => {
  const runQuery = vi.fn();
  return { runQuery, all: runQuery };
});

import { runQuery } from "@/core/server/db";
import { liveQuery } from "../liveQuery";
import { setQueryCache, getQueryCache, clearQueryCache } from "../queryCache";
import { emit } from "@/core/server/sync/syncEvents";
import { q } from "@/core/shared/query";

const mockRunQuery = vi.mocked(runQuery);

const CATEGORIES = q("categories").serializeAsString();
const ACCOUNTS = q("accounts").serializeAsString();

beforeEach(() => {
  vi.clearAllMocks();
  clearQueryCache();
});

describe("queryCache invalidation", () => {
  it("drops an entry when its table is written", () => {
    setQueryCache(CATEGORIES, [{ id: "a" }]);
    setQueryCache(ACCOUNTS, [{ id: "b" }]);

    emit({ type: "applied", tables: ["categories"] });

    expect(getQueryCache(CATEGORIES)).toBeNull();
    expect(getQueryCache(ACCOUNTS)).toEqual([{ id: "b" }]);
  });

  it("drops on a remote sync landing, the same as a local write", () => {
    setQueryCache(CATEGORIES, [{ id: "a" }]);

    emit({ type: "success", tables: ["categories"] });

    expect(getQueryCache(CATEGORIES)).toBeNull();
  });

  it("survives sync start, which announces no written tables", () => {
    setQueryCache(CATEGORIES, [{ id: "a" }]);

    emit({ type: "start", tables: [] });

    expect(getQueryCache(CATEGORIES)).toEqual([{ id: "a" }]);
  });

  it("treats an entry whose key names no tables as depending on everything", () => {
    setQueryCache("not-a-serialized-query", [{ id: "a" }]);

    emit({ type: "applied", tables: ["transactions"] });

    expect(getQueryCache("not-a-serialized-query")).toBeNull();
  });
});

describe("liveQuery write-back", () => {
  it("caches each run's result under the query's key", async () => {
    mockRunQuery.mockResolvedValue([{ id: "cat1", name: "Food" }]);

    const onData = vi.fn();
    const query = q("categories").select(["id", "name"]);
    const live = liveQuery(query, { onData });
    await vi.waitFor(() => expect(onData).toHaveBeenCalled());

    expect(getQueryCache(query.serializeAsString())).toEqual([{ id: "cat1", name: "Food" }]);
    live.unsubscribe();
  });

  it("replaces the bootstrap snapshot after a write to the table", async () => {
    const query = q("categories").select(["id", "name"]);
    // What bootstrap left behind: the pre-mutation order.
    setQueryCache(query.serializeAsString(), [{ id: "old" }]);

    mockRunQuery.mockResolvedValue([{ id: "new" }]);
    const onData = vi.fn();
    const live = liveQuery(query, { onData });
    await vi.waitFor(() => expect(onData).toHaveBeenCalled());

    // The mutation lands: cache is evicted, the live query re-runs and
    // writes the fresh result back.
    emit({ type: "applied", tables: ["categories"] });
    await vi.waitFor(() => expect(onData).toHaveBeenCalledTimes(2));

    expect(getQueryCache(query.serializeAsString())).toEqual([{ id: "new" }]);
    live.unsubscribe();
  });
});
