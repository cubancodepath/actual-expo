import { describe, it, expect } from "vitest";
import { extractTemplateLines, stripTemplateLines } from "./parse";

describe("stripTemplateLines", () => {
  it("removes template lines and keeps the user's own notes", () => {
    const notes = "Groceries for the month\n#template 50\nSplit with Ana";
    expect(stripTemplateLines(notes)).toBe("Groceries for the month\nSplit with Ana");
  });

  it("returns an empty string when the note is only templates", () => {
    expect(stripTemplateLines("#template 50\n#goal 500")).toBe("");
  });

  it("keeps directives this app doesn't manage", () => {
    expect(stripTemplateLines("#cleanup\n#template 50")).toBe("#cleanup");
  });

  it("removes a percentage line when its category name can be resolved", () => {
    const names = new Map([["Salary", "cat-1"]]);
    expect(stripTemplateLines("#template 10% of Salary\nnote", names)).toBe("note");
  });

  it("keeps a percentage line whose category can't be resolved, matching the parser", () => {
    // parseTemplateNotes skips it too, so removing it here would delete a
    // template the user can still see and we never imported.
    expect(stripTemplateLines("#template 10% of Salary\nnote")).toBe(
      "#template 10% of Salary\nnote",
    );
  });

  it("handles an empty or missing note", () => {
    expect(stripTemplateLines(null)).toBe("");
    expect(stripTemplateLines("")).toBe("");
  });
});

describe("extractTemplateLines", () => {
  it("keeps only the template lines, dropping the user's notes", () => {
    const notes = "Groceries for the month\n#template 50\nSplit with Ana";
    expect(extractTemplateLines(notes)).toBe("#template 50");
  });

  it("is the complement of stripTemplateLines (round-trips back to the note)", () => {
    const notes = "Groceries for the month\n#template 50\nSplit with Ana";
    const plain = stripTemplateLines(notes);
    const templates = extractTemplateLines(notes);
    expect([plain, templates].filter(Boolean).join("\n")).toBe(
      "Groceries for the month\nSplit with Ana\n#template 50",
    );
  });

  it("returns an empty string when there are no template lines", () => {
    expect(extractTemplateLines("just a plain reminder")).toBe("");
  });

  it("does not treat unmanaged directives as templates", () => {
    expect(extractTemplateLines("#cleanup\n#template 50")).toBe("#template 50");
  });

  it("handles an empty or missing note", () => {
    expect(extractTemplateLines(null)).toBe("");
    expect(extractTemplateLines("")).toBe("");
  });
});
