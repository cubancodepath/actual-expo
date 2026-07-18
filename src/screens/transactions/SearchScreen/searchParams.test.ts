import { describe, expect, it } from "vitest";
import { buildSearchParams } from "./searchParams";
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
