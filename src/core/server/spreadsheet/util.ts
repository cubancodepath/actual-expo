/**
 * Cell-name helpers. A cell's full name is "<sheet>!<name>" — the sheet is a
 * month ("budget2026-07", see sheetForMonth) and the name identifies the cell
 * within it ("to-budget", "budget-<categoryId>"). Same split as upstream's
 * server/spreadsheet/util.ts.
 *
 * Deliberately dependency-free so every layer can resolve a name.
 */

export function resolveName(sheet: string, name: string): string {
  return `${sheet}!${name}`;
}

export function unresolveName(resolved: string): { sheet: string; name: string } {
  const idx = resolved.indexOf("!");
  return { sheet: resolved.slice(0, idx), name: resolved.slice(idx + 1) };
}
