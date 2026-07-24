import { describe, expect, it } from "vitest";
import { buildSearchParams, buildSearchQuery } from "./searchParams";
import type { SearchToken } from "./searchTokens";

describe("buildSearchParams", () => {
  it("maps each token type to its query opt", () => {
    const tokens: SearchToken[] = [
      { type: "text", value: "coffee" },
      { type: "status", value: "cleared" },
      { type: "account", accountId: "acc1", accountName: "Checking" },
      { type: "category", categoryId: "cat1", categoryName: "Food" },
      { type: "payee", payeeId: "pay1", payeeName: "Store" },
      { type: "tag", tagName: "trip" },
      { type: "tag", tagName: "work" },
      { type: "uncategorized" },
    ];
    expect(buildSearchParams(tokens)).toEqual({
      text: "coffee",
      cleared: true,
      accountId: "acc1",
      categoryId: "cat1",
      payeeId: "pay1",
      tagNames: ["trip", "work"],
      uncategorized: true,
    });
  });

  it("returns no keys for no tokens", () => {
    expect(buildSearchParams([])).toEqual({});
  });

  it("a fixed account scope wins over an account token", () => {
    const tokens: SearchToken[] = [{ type: "account", accountId: "other", accountName: "Other" }];
    expect(buildSearchParams(tokens, "scoped")).toEqual({ accountId: "scoped" });
  });
});

// Query-builder structure tests — compiler-agnostic (valid across the AQL port).
// End-to-end SQL execution is covered by the AQL smoke test.
describe("buildSearchQuery", () => {
  const filtersFor = (params: Parameters<typeof buildSearchQuery>[0]) =>
    buildSearchQuery(params).serialize().filterExpressions as Array<Record<string, unknown>>;

  it("empty search selects everything and has no filters", () => {
    const state = buildSearchQuery({}).serialize();
    expect(state.filterExpressions).toEqual([]);
    expect(state.selectExpressions).toContain("*");
  });

  it("text search matches payee, category, notes and account name (ref-paths)", () => {
    const filters = filtersFor({ text: "coffee" });
    const or = filters.find((f) => "$or" in f)!.$or as Array<Record<string, unknown>>;
    const keys = or.flatMap((c) => Object.keys(c));
    expect(keys).toEqual(
      expect.arrayContaining(["payee.name", "category.name", "notes", "account.name"]),
    );
  });

  it("uncategorized excludes on-budget transfers via the transfer ref-paths", () => {
    const filters = filtersFor({ uncategorized: true });
    expect(filters).toContainEqual({ category: null });
    const or = filters.find((f) => "$or" in f)!.$or as Array<Record<string, unknown>>;
    expect(or).toContainEqual({ "payee.transfer_acct": null });
    expect(or).toContainEqual({ "payee.transfer_acct.offbudget": true });
  });

  it("maps account/category/payee/tag filters (upstream field names)", () => {
    const filters = filtersFor({
      accountId: "a1",
      categoryId: "c1",
      payeeId: "p1",
      tagNames: ["trip"],
    });
    expect(filters).toContainEqual({ account: "a1" });
    expect(filters).toContainEqual({ category: "c1" });
    expect(filters).toContainEqual({ payee: "p1" });
    expect(filters).toContainEqual({ notes: { $like: "%#trip%" } });
  });
});
