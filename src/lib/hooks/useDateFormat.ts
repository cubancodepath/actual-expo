/**
 * useDateFormat — reactive date formatting, mirroring upstream's `useDateFormat`
 * (packages/desktop-client/src/hooks/useDateFormat.ts). Upstream has no date
 * *component*; date displays format inline with this hook. We follow suit.
 *
 * Returns the current `dateFormat` string plus bound helpers that format a
 * YYYYMMDD integer with it. Because it subscribes to `useSyncedPref`, displays
 * update the instant the pref changes.
 */
import { useMemo } from "react";
import { useSyncedPref } from "@/lib/hooks/useSyncedPref";
import { formatDateWith, formatDateShortWith } from "@/core/shared/months";

export type UseDateFormatResult = {
  /** e.g. "MM/dd/yyyy" */
  dateFormat: string;
  /** YYYYMMDD → full date, e.g. "03/02/2025". */
  formatLong: (d: number) => string;
  /** YYYYMMDD → short date (no year), e.g. "03/02". */
  formatShort: (d: number) => string;
};

export function useDateFormat(): UseDateFormatResult {
  const [dateFormatPref] = useSyncedPref("dateFormat");
  const dateFormat = dateFormatPref || "MM/dd/yyyy";

  return useMemo(
    () => ({
      dateFormat,
      formatLong: (d: number) => formatDateWith(d, dateFormat),
      formatShort: (d: number) => formatDateShortWith(d, dateFormat),
    }),
    [dateFormat],
  );
}
