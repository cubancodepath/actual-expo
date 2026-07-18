import { describe, expect, it } from "vitest";
import { addToken, initialTokensFromFilter, tokenKey, type SearchToken } from "./searchTokens";

describe("tokenKey", () => {
  it("is stable and unique per token", () => {
    expect(tokenKey({ type: "text", value: "coffee" })).toBe("text:coffee");
    expect(tokenKey({ type: "status", value: "cleared" })).toBe("status:cleared");
    expect(tokenKey({ type: "account", accountId: "a1", accountName: "A" })).toBe("account:a1");
    expect(tokenKey({ type: "tag", tagName: "trip" })).toBe("tag:trip");
    expect(tokenKey({ type: "uncategorized" })).toBe("uncategorized");
  });
});

describe("addToken", () => {
  it("replaces single-value filters of the same kind", () => {
    const prev: SearchToken[] = [{ type: "account", accountId: "a1", accountName: "A" }];
    const next = addToken(prev, { type: "account", accountId: "a2", accountName: "B" });
    expect(next).toEqual([{ type: "account", accountId: "a2", accountName: "B" }]);
  });

  it("replaces the text token", () => {
    const prev: SearchToken[] = [{ type: "text", value: "coffee" }];
    const next = addToken(prev, { type: "text", value: "tea" });
    expect(next).toEqual([{ type: "text", value: "tea" }]);
  });

  it("allows multiple different tags but collapses duplicates", () => {
    let tokens = addToken([], { type: "tag", tagName: "trip" });
    tokens = addToken(tokens, { type: "tag", tagName: "work" });
    tokens = addToken(tokens, { type: "tag", tagName: "trip" });
    expect(tokens).toEqual([
      { type: "tag", tagName: "work" },
      { type: "tag", tagName: "trip" },
    ]);
  });

  it("removes mutually exclusive statuses", () => {
    const prev: SearchToken[] = [{ type: "status", value: "cleared" }];
    const next = addToken(prev, { type: "status", value: "uncleared" });
    expect(next).toEqual([{ type: "status", value: "uncleared" }]);
  });

  it("uncategorized displaces category and vice versa", () => {
    const withCategory = addToken([{ type: "uncategorized" }], {
      type: "category",
      categoryId: "c1",
      categoryName: "Food",
    });
    expect(withCategory).toEqual([{ type: "category", categoryId: "c1", categoryName: "Food" }]);

    const withUncategorized = addToken(withCategory, { type: "uncategorized" });
    expect(withUncategorized).toEqual([{ type: "uncategorized" }]);
  });
});

describe("initialTokensFromFilter", () => {
  it("maps uncategorized and the four statuses", () => {
    expect(initialTokensFromFilter("uncategorized")).toEqual([{ type: "uncategorized" }]);
    expect(initialTokensFromFilter("uncleared")).toEqual([{ type: "status", value: "uncleared" }]);
    expect(initialTokensFromFilter("reconciled")).toEqual([
      { type: "status", value: "reconciled" },
    ]);
  });

  it("ignores unknown or missing filters", () => {
    expect(initialTokensFromFilter(undefined)).toEqual([]);
    expect(initialTokensFromFilter("bogus")).toEqual([]);
  });
});
