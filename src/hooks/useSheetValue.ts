/**
 * useSheetValue — subscribe to a spreadsheet cell value.
 *
 * Ported from Actual Budget's useSheetValue pattern.
 * Re-renders only when the specific cell's value changes.
 *
 * @example
 * const toBudget = useSheetValue("budget2026-03", "to-budget");
 * const catBalance = useSheetValue(sheetForMonth(month), envelopeBudget.catBalance(catId));
 */

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { CellValue, Spreadsheet } from "@/core/server/spreadsheet/spreadsheet";
import { resolveName } from "@/core/server/spreadsheet/util";
import {
  getSpreadsheet,
  getSpreadsheetGeneration,
  subscribeToSpreadsheetSwap,
} from "@/core/server/sheet";

/**
 * The live spreadsheet, reactively: re-renders the component when opening a
 * budget publishes a new instance (or closing one drops it). Every hook below
 * keeps `ss` in its effect deps, so a swap re-seeds the value from the new
 * instance and re-subscribes there — which is what makes a budget switch show
 * the new file's numbers even for cells that compute to plain 0.
 */
export function useSpreadsheet(): Spreadsheet {
  useSyncExternalStore(
    subscribeToSpreadsheetSwap,
    getSpreadsheetGeneration,
    getSpreadsheetGeneration,
  );
  return getSpreadsheet();
}

export function useSheetValue(sheet: string, cellName: string): CellValue {
  const ss = useSpreadsheet();
  const resolved = resolveName(sheet, cellName);

  const [value, setValue] = useState<CellValue>(() => ss.getResolved(resolved));

  useEffect(() => {
    // Read current value (may have changed since initial render)
    setValue(ss.getResolved(resolved));

    // Subscribe to changes for this cell only — O(1) dispatch per
    // notification instead of scanning every changed cell name (plan 014).
    return ss.onCellChanged(resolved, setValue);
  }, [resolved, ss]);

  return value;
}

/**
 * useSheetValueNumber — like useSheetValue but always returns a number.
 */
export function useSheetValueNumber(sheet: string, cellName: string): number {
  const value = useSheetValue(sheet, cellName);
  return typeof value === "number" ? value : 0;
}

/**
 * useSpreadsheetVersion — re-renders when any spreadsheet cell changes.
 * Use as a dependency in useMemo to force recalculation when budget data changes.
 */
export function useSpreadsheetVersion(): number {
  const ss = useSpreadsheet();
  const [version, setVersion] = useState(() => ss.version);

  useEffect(() => {
    // Adopt the instance's version up front: after a budget switch this is the
    // only signal that everything memoized on it must be recomputed.
    setVersion(ss.version);
    return ss.onCellsChanged(() => {
      setVersion(ss.version);
    });
  }, [ss]);

  return version;
}

/**
 * Like useSpreadsheetVersion, but only bumps when a changed cell name passes
 * `matches`. Use for screens that scan many cells of one kind (e.g. all
 * category balances) so unrelated computations don't re-render them.
 */
export function useSpreadsheetVersionWhere(matches: (name: string) => boolean): number {
  const ss = useSpreadsheet();
  const [version, setVersion] = useState(() => ss.version);
  const matchesRef = useRef(matches);
  matchesRef.current = matches;

  useEffect(() => {
    setVersion(ss.version);
    return ss.onCellsChanged((changedNames) => {
      if (changedNames.some((n) => matchesRef.current(n))) {
        setVersion(ss.version);
      }
    });
  }, [ss]);

  return version;
}
