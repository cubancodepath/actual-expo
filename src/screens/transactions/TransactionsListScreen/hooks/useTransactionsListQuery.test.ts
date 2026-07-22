import { describe, expect, it } from "vitest";
import { compile } from "@/core/queries";
import { buildTransactionsListQuery } from "./useTransactionsListQuery";

describe("buildTransactionsListQuery", () => {
  it("all context has no account/category filter and joins accountName", () => {
    const query = buildTransactionsListQuery({ kind: "all" }, "2026-07");
    const { sql, params } = compile(query.serialize());
    expect(sql).toContain('"accountName"');
    expect(params).toEqual([]);
  });

  it("account context filters by acct and joins accountName", () => {
    const query = buildTransactionsListQuery({ kind: "account", accountId: "acc-1" }, "2026-07");
    const { sql, params } = compile(query.serialize());
    expect(sql).toContain('"accountName"');
    expect(params).toContain("acc-1");
    // No reconciled WHERE condition unless showReconciled is explicitly false
    // (the `*` select still lists the reconciled column, so match the comparison).
    expect(sql).not.toMatch(/reconciled = /);
  });

  it("account context hides reconciled when showReconciled is false", () => {
    const query = buildTransactionsListQuery(
      { kind: "account", accountId: "acc-1", showReconciled: false },
      "2026-07",
    );
    const { sql, params } = compile(query.serialize());
    expect(params).toContain("acc-1");
    expect(sql).toMatch(/reconciled = \?/);
    expect(params).toContain(0);
  });

  it("category context filters by category and a month date range (no $transform)", () => {
    const query = buildTransactionsListQuery({ kind: "category", categoryId: "cat-1" }, "2026-12");
    const { sql, params } = compile(query.serialize());
    expect(sql).toContain('"accountName"');
    expect(params).toContain("cat-1");
    // "2026-12-01" / "2027-01-01" bounds converted to YYYYMMDD ints
    expect(params).toContain(20261201);
    expect(params).toContain(20270101);
    expect(sql).toMatch(/date.*>= \?/);
    expect(sql).toMatch(/date.*< \?/);
  });
});
