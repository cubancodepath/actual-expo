import * as d from "date-fns";
import type { Locale } from "date-fns";
import * as monthUtils from "@/core/shared/monthUtils";

/**
 * Human date-range label for a widget header (upstream `DateRange`, simplified
 * for the read-only mobile card): a single "MMMM yyyy" when start and end share
 * a month, otherwise "MMM yyyy – MMM yyyy". The budget/average comparison
 * variants are handled by the spending card when it lands.
 */
export function formatDateRange(start: string, end: string, locale?: Locale): string | null {
  const startParsed = monthUtils.parseDate(start);
  const endParsed = monthUtils.parseDate(end);
  if (!startParsed || !endParsed) return null;

  const sameMonth =
    startParsed.getFullYear() === endParsed.getFullYear() &&
    startParsed.getMonth() === endParsed.getMonth();

  if (sameMonth) {
    return d.format(endParsed, "MMMM yyyy", { locale });
  }
  const startLabel = d.format(startParsed, "MMM yyyy", { locale });
  const endLabel = d.format(endParsed, "MMM yyyy", { locale });
  return `${startLabel} – ${endLabel}`;
}
