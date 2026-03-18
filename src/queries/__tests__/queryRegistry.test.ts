import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerQuery, unregisterQuery, refreshQueriesForDatasets } from "../queryRegistry";

beforeEach(() => {
  // Clean up registry between tests
  unregisterQuery("test-1");
  unregisterQuery("test-2");
  unregisterQuery("test-3");
});

describe("registerQuery + refreshQueriesForDatasets", () => {
  it("notifies queries whose datasets match", () => {
    const cb1 = vi.fn();
    const cb2 = vi.fn();

    registerQuery("test-1", ["transactions"], cb1);
    registerQuery("test-2", ["categories"], cb2);

    refreshQueriesForDatasets(new Set(["transactions"]));

    expect(cb1).toHaveBeenCalledTimes(1);
    expect(cb2).not.toHaveBeenCalled();
  });

  it("notifies multiple queries for overlapping datasets", () => {
    const cb1 = vi.fn();
    const cb2 = vi.fn();

    registerQuery("test-1", ["transactions", "payees"], cb1);
    registerQuery("test-2", ["transactions", "categories"], cb2);

    refreshQueriesForDatasets(new Set(["transactions"]));

    expect(cb1).toHaveBeenCalledTimes(1);
    expect(cb2).toHaveBeenCalledTimes(1);
  });

  it("does not notify for unrelated datasets", () => {
    const cb = vi.fn();
    registerQuery("test-1", ["accounts"], cb);

    refreshQueriesForDatasets(new Set(["transactions"]));

    expect(cb).not.toHaveBeenCalled();
  });
});

describe("unregisterQuery", () => {
  it("removes the query so it no longer receives notifications", () => {
    const cb = vi.fn();
    registerQuery("test-1", ["transactions"], cb);
    unregisterQuery("test-1");

    refreshQueriesForDatasets(new Set(["transactions"]));

    expect(cb).not.toHaveBeenCalled();
  });
});
