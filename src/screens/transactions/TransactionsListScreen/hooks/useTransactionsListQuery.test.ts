import { describe, expect, it } from "vitest";
import { buildTransactionsListQuery } from "./useTransactionsListQuery";

// These test the query-builder logic (correct filters/select per context) by
// asserting on the serialized query structure — compiler-agnostic, so it stays
// valid across the AQL port. End-to-end SQL is covered by the AQL smoke test.
describe("buildTransactionsListQuery", () => {
  it("all context has no filter and selects all fields", () => {
    const state = buildTransactionsListQuery({ kind: "all" }, "2026-07").serialize();
    expect(state.filterExpressions).toEqual([]);
    expect(state.selectExpressions).toContain("*");
  });

  it("account context filters by account (upstream field name)", () => {
    const state = buildTransactionsListQuery(
      { kind: "account", accountId: "acc-1" },
      "2026-07",
    ).serialize();
    expect(state.filterExpressions).toContainEqual({ account: "acc-1" });
    expect(state.selectExpressions).toContain("*");
  });

  it("account context hides reconciled when showReconciled is false", () => {
    const state = buildTransactionsListQuery(
      { kind: "account", accountId: "acc-1", showReconciled: false },
      "2026-07",
    ).serialize();
    expect(state.filterExpressions).toContainEqual({
      account: "acc-1",
      reconciled: { $eq: false },
    });
  });

  it("category context filters by category and a month date range (string bounds)", () => {
    const state = buildTransactionsListQuery(
      { kind: "category", categoryId: "cat-1" },
      "2026-12",
    ).serialize();
    expect(state.filterExpressions).toContainEqual({
      category: "cat-1",
      date: { $gte: "2026-12-01", $lt: "2027-01-01" },
    });
  });
});
