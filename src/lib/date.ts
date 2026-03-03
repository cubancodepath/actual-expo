/**
 * Centralized date utilities.
 *
 * The app stores dates as YYYYMMDD integers in SQLite.
 * Budget months are stored as "YYYY-MM" strings.
 * All helpers here work with those two canonical formats.
 *
 * Uses date-fns under the hood — if we ever swap libraries,
 * only this file needs to change.
 */

import {
  format,
  addMonths as dfnsAddMonths,
} from "date-fns";

// ── Internal helper ───────────────────────────────────────────────────────────

/** Convert YYYYMMDD integer to a Date object. */
function intToDate(d: number): Date {
  const s = String(d);
  return new Date(
    parseInt(s.slice(0, 4), 10),
    parseInt(s.slice(4, 6), 10) - 1,
    parseInt(s.slice(6, 8), 10),
  );
}

// ── Today ─────────────────────────────────────────────────────────────────────

/** Today as YYYYMMDD integer, e.g. 20250302 */
export function todayInt(): number {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return parseInt(`${y}${m}${day}`, 10);
}

/** Today as "YYYY-MM-DD" string. */
export function todayStr(): string {
  return intToStr(todayInt());
}

// ── Format for display ────────────────────────────────────────────────────────

/** YYYYMMDD → "Mar 2" */
export function formatDate(d: number): string {
  return format(intToDate(d), "MMM d");
}

/** YYYYMMDD → "March 2, 2025" */
export function formatDateLong(d: number): string {
  return format(intToDate(d), "MMMM d, yyyy");
}

// ── Conversion between int and string ─────────────────────────────────────────

/** YYYYMMDD integer → "YYYY-MM-DD" string. */
export function intToStr(d: number): string {
  const s = String(d);
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

/**
 * "YYYY-MM-DD" string (or "YYYYMMDD") → YYYYMMDD integer.
 * Returns null if the string is not a valid 8-digit date.
 */
export function strToInt(s: string): number | null {
  const clean = s.replace(/\D/g, "");
  if (clean.length !== 8) return null;
  const num = parseInt(clean, 10);
  if (isNaN(num)) return null;
  return num;
}

/**
 * Auto-insert dashes as user types: "20250302" → "2025-03-02".
 * Used for date input formatting.
 */
export function formatInputDate(s: string): string {
  const d = s.replace(/\D/g, "");
  if (d.length <= 4) return d;
  if (d.length <= 6) return `${d.slice(0, 4)}-${d.slice(4)}`;
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
}

// ── Month helpers ("YYYY-MM" strings) ─────────────────────────────────────────

/** Current month as "YYYY-MM". */
export function currentMonth(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

/**
 * Add (or subtract) months from a "YYYY-MM" string.
 * @example addMonths("2025-03", -1) → "2025-02"
 * @example addMonths("2025-12", 1)  → "2026-01"
 */
export function addMonths(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = dfnsAddMonths(new Date(y, m - 1, 1), n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** "YYYY-MM" → "March 2025" */
export function formatMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return format(new Date(y, m - 1, 1), "MMMM yyyy");
}

/** "YYYY-MM" → YYYYMM integer. */
export function monthToInt(month: string): number {
  return parseInt(month.replace("-", ""), 10);
}
