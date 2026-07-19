import { describe, it, expect } from "vitest";
import { parseCleanupLine, parseCleanupNote } from "./parse";

describe("parseCleanupLine — the 5 variants", () => {
  it("global source", () => {
    expect(parseCleanupLine("#cleanup source")).toEqual({ type: "source", group: null });
  });

  it("global sink, default weight 1", () => {
    expect(parseCleanupLine("#cleanup sink")).toEqual({ type: "sink", group: null, weight: 1 });
  });

  it("global sink with weight", () => {
    expect(parseCleanupLine("#cleanup sink 3")).toEqual({ type: "sink", group: null, weight: 3 });
  });

  it("group source", () => {
    expect(parseCleanupLine("#cleanup Vacations source")).toEqual({
      type: "source",
      group: "Vacations",
    });
  });

  it("group sink with weight", () => {
    expect(parseCleanupLine("#cleanup Vacations sink 2")).toEqual({
      type: "sink",
      group: "Vacations",
      weight: 2,
    });
  });

  it("group sink default weight", () => {
    expect(parseCleanupLine("#cleanup Vacations sink")).toEqual({
      type: "sink",
      group: "Vacations",
      weight: 1,
    });
  });

  it("bare group name = overspend member", () => {
    expect(parseCleanupLine("#cleanup Vacations")).toEqual({
      type: "overspend",
      group: "Vacations",
    });
  });
});

describe("parseCleanupLine — weight coercion quirks", () => {
  it("weight 0 collapses to 1 (+w || 1)", () => {
    expect(parseCleanupLine("#cleanup sink 0")).toEqual({ type: "sink", group: null, weight: 1 });
  });

  it("adjacent weight (no space) still parses", () => {
    expect(parseCleanupLine("#cleanup sink5")).toEqual({ type: "sink", group: null, weight: 5 });
  });

  it("multi-word group name is preserved", () => {
    expect(parseCleanupLine("#cleanup Big Trip source")).toEqual({
      type: "source",
      group: "Big Trip",
    });
  });
});

describe("parseCleanupLine — rejects", () => {
  it("rejects uppercase #Cleanup (lowercase literal only)", () => {
    expect(parseCleanupLine("#Cleanup source")).toBeNull();
  });

  it("rejects missing space after #cleanup", () => {
    expect(parseCleanupLine("#cleanupsource")).toBeNull();
  });

  it("rejects a non-cleanup line", () => {
    expect(parseCleanupLine("just a note")).toBeNull();
  });
});

describe("parseCleanupNote — multi-line scan", () => {
  it("collects every valid cleanup line and skips the rest", () => {
    const note = [
      "Some description",
      "#cleanup source",
      "#Cleanup Vacations sink", // uppercase → skipped
      "#cleanup Vacations sink 2",
      "#template 100 by 2026-12", // goal directive → not cleanup
    ].join("\n");
    expect(parseCleanupNote(note)).toEqual([
      { type: "source", group: null },
      { type: "sink", group: "Vacations", weight: 2 },
    ]);
  });

  it("returns [] for null/empty notes", () => {
    expect(parseCleanupNote(null)).toEqual([]);
    expect(parseCleanupNote("")).toEqual([]);
    expect(parseCleanupNote("no directives here")).toEqual([]);
  });
});
