import { describe, expect, it } from "vitest";
import { SURFACE_LEVELS, type SurfaceContext } from "./surface-level.tokens";

/**
 * The ladder is a contract, not a preference: a sheet floats over a screen, so
 * every rung inside it must sit one step below the equivalent rung on a screen,
 * or the two collapse into the same color (in dark mode `--surface` and
 * `--overlay` are literally the same value).
 */
describe("SURFACE_LEVELS", () => {
  it("puts a screen at the base of the ladder", () => {
    expect(SURFACE_LEVELS.screen).toEqual({
      canvas: "bg-background",
      item: "bg-surface",
      nested: "bg-surface-secondary",
      itemVariant: "default",
      nestedVariant: "secondary",
      canvasToken: "background",
      context: "screen",
    });
  });

  it("shifts a sheet one rung down so it reads as elevated", () => {
    expect(SURFACE_LEVELS.sheet).toEqual({
      canvas: "bg-overlay",
      item: "bg-surface-secondary",
      nested: "bg-surface-tertiary",
      itemVariant: "secondary",
      nestedVariant: "tertiary",
      canvasToken: "overlay",
      context: "sheet",
    });
  });

  const contexts = Object.keys(SURFACE_LEVELS) as SurfaceContext[];

  it.each(contexts)("keeps canvas, item and nested distinct in %s", (context) => {
    const { canvas, item, nested } = SURFACE_LEVELS[context];
    expect(new Set([canvas, item, nested]).size).toBe(3);
  });

  it.each(contexts)("self-describes its own context key in %s", (context) => {
    expect(SURFACE_LEVELS[context].context).toBe(context);
  });

  it("never reuses a screen rung at the same depth in a sheet", () => {
    const { screen, sheet } = SURFACE_LEVELS;
    expect(sheet.item).not.toBe(screen.item);
    expect(sheet.nested).not.toBe(screen.nested);
    // A sheet's item is the screen's nested rung — that's the one-step shift.
    expect(sheet.item).toBe(screen.nested);
  });
});
