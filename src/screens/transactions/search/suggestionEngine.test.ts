import { describe, expect, it } from "vitest";
import {
  buildSuggestions,
  suggestionToToken,
  type BuildSuggestionsInput,
} from "./suggestionEngine";

const STATUS_LABELS: Record<string, string> = {
  cleared: "Cleared",
  uncleared: "Uncleared",
  reconciled: "Reconciled",
  unreconciled: "Unreconciled",
};

const opt = (id: string, name: string) => ({ id, name, nameLower: name.toLowerCase() });
const tagOpt = (tag: string) => ({ tag, tagLower: tag.toLowerCase() });

function input(overrides: Partial<BuildSuggestionsInput> = {}): BuildSuggestionsInput {
  return {
    text: "",
    tokens: [],
    accounts: [opt("a1", "Checking"), opt("a2", "Savings"), opt("a3", "Cash")],
    categories: [opt("c1", "Food"), opt("c2", "Rent"), opt("c3", "Fun")],
    payees: [opt("p1", "Coffee Corner"), opt("p2", "Market")],
    tags: [tagOpt("trip"), tagOpt("work")],
    statusLabel: (s) => STATUS_LABELS[s],
    uncategorizedLabel: "Uncategorized",
    ...overrides,
  };
}

describe("buildSuggestions", () => {
  it("caps the total and each name-based kind; all four statuses fit", () => {
    const result = buildSuggestions(input());
    expect(result.length).toBeLessThanOrEqual(8);
    expect(result.filter((s) => s.kind === "status").length).toBe(4);
    const typed = buildSuggestions(input({ text: "c" }));
    expect(typed.length).toBeLessThanOrEqual(8);
    for (const kind of ["account", "category", "payee", "tag"]) {
      expect(typed.filter((s) => s.kind === kind).length).toBeLessThanOrEqual(2);
    }
  });

  it("puts 'anything contains' first when there is text", () => {
    const result = buildSuggestions(input({ text: "cof" }));
    expect(result[0]).toEqual({ kind: "text", value: "cof" });
    // "cof" matches the Coffee Corner payee too
    expect(result).toContainEqual({ kind: "payee", id: "p1", name: "Coffee Corner" });
  });

  it("has no text row without text", () => {
    const result = buildSuggestions(input());
    expect(result.some((s) => s.kind === "text")).toBe(false);
  });

  it("matches by name when typing and drops non-matches", () => {
    const result = buildSuggestions(input({ text: "food" }));
    expect(result).toContainEqual({ kind: "category", id: "c1", name: "Food" });
    expect(result.some((s) => s.kind === "account")).toBe(false);
  });

  it("dedups active statuses, including their exclusive counterpart", () => {
    const result = buildSuggestions(input({ tokens: [{ type: "status", value: "cleared" }] }));
    expect(result.some((s) => s.kind === "status" && s.value === "cleared")).toBe(false);
    expect(result.some((s) => s.kind === "status" && s.value === "uncleared")).toBe(false);
    expect(result.some((s) => s.kind === "status" && s.value === "reconciled")).toBe(true);
  });

  it("dedups active tags when typing", () => {
    const result = buildSuggestions(
      input({
        text: "wor",
        tags: [tagOpt("work"), tagOpt("working")],
        tokens: [{ type: "tag", tagName: "work" }],
      }),
    );
    expect(result.some((s) => s.kind === "tag" && s.name === "work")).toBe(false);
    expect(result.some((s) => s.kind === "tag" && s.name === "working")).toBe(true);
  });

  it("shows no name-based suggestions without text", () => {
    const result = buildSuggestions(input());
    for (const kind of ["account", "category", "payee", "tag"]) {
      expect(result.some((s) => s.kind === kind)).toBe(false);
    }
    expect(result.some((s) => s.kind === "status")).toBe(true);
    expect(result.some((s) => s.kind === "uncategorized")).toBe(true);
  });

  it("hides account suggestions when scoped to an account", () => {
    const result = buildSuggestions(input({ text: "c", hideAccounts: true }));
    expect(result.some((s) => s.kind === "account")).toBe(false);
  });

  it("skips uncategorized when already active", () => {
    const result = buildSuggestions(input({ tokens: [{ type: "uncategorized" }] }));
    expect(result.some((s) => s.kind === "uncategorized")).toBe(false);
  });
});

describe("suggestionToToken", () => {
  it("maps each suggestion kind to its token", () => {
    expect(suggestionToToken({ kind: "text", value: "coffee" })).toEqual({
      type: "text",
      value: "coffee",
    });
    expect(suggestionToToken({ kind: "account", id: "a1", name: "Checking" })).toEqual({
      type: "account",
      accountId: "a1",
      accountName: "Checking",
    });
    expect(suggestionToToken({ kind: "uncategorized" })).toEqual({ type: "uncategorized" });
  });
});
