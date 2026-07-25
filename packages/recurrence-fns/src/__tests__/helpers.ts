import type { IOccurrence } from "../types";

/** `YYYY-MM-DD` → local Date at noon, the anchor Actual uses. */
export function at(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d, 12);
}

export function days(occurrences: IOccurrence[]): string[] {
  return occurrences.map(({ date }) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  });
}
