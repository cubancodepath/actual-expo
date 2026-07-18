import { describe, expect, it } from "vitest";
import { compile } from "@/core/queries";
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

describe("buildSearchQuery", () => {
  const compileFor = (params: Parameters<typeof buildSearchQuery>[0]) =>
    compile(buildSearchQuery(params).serialize());

  it("compiles an empty search without throwing", () => {
    expect(() => compileFor({})).not.toThrow();
  });

  it("text search matches payee, category, notes and account name", () => {
    const { sql, params } = compileFor({ text: "coffee" });
    expect(sql).toContain("OR");
    expect(sql).toContain("LIKE");
    // Uses the account-name virtual field JOIN
    expect(sql).toContain("JOIN accounts acc ON");
    expect(params).toContain("%coffee%");
  });

  it("uncategorized excludes on-budget transfers via the transfer flags", () => {
    const { sql, params } = compileFor({ uncategorized: true });
    // category IS NULL is a literal (no param); the transfer flags are parameterized.
    expect(sql).toContain("IS NULL");
    expect(sql).toContain("(tr_acc.id IS NOT NULL) =");
    expect(sql).toContain("tr_acc.offbudget =");
    expect(params).toContain(0); // isTransfer: false
    expect(params).toContain(1); // transferAccountOffbudget: true
  });

  it("maps account/category/payee/tag filters", () => {
    const { sql, params } = compileFor({
      accountId: "a1",
      categoryId: "c1",
      payeeId: "p1",
      tagNames: ["trip"],
    });
    expect(sql).toContain("t.acct =");
    expect(sql).toContain("t.notes LIKE");
    expect(params).toEqual(expect.arrayContaining(["a1", "c1", "p1", "%#trip%"]));
  });
});
