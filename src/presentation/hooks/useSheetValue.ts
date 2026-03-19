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

import { useEffect, useState } from "react";
import { resolveName, type CellValue } from "@/spreadsheet/spreadsheet";
import { getSpreadsheet } from "@/spreadsheet/instance";

export function useSheetValue(sheet: string, cellName: string): CellValue {
  const ss = getSpreadsheet();
  const resolved = resolveName(sheet, cellName);

  const [value, setValue] = useState<CellValue>(() => ss.getResolved(resolved));

  useEffect(() => {
    // Read current value (may have changed since initial render)
    setValue(ss.getResolved(resolved));

    // Subscribe to changes
    return ss.onCellsChanged((changedNames) => {
      if (changedNames.includes(resolved)) {
        setValue(ss.getResolved(resolved));
      }
    });
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
  const ss = getSpreadsheet();
  const [version, setVersion] = useState(() => ss.version);

  useEffect(() => {
    return ss.onCellsChanged(() => {
      setVersion(ss.version);
    });
  }, [ss]);

  return version;
}
