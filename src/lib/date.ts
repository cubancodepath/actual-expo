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

import { format, addMonths as dfnsAddMonths } from "date-fns";

// ── Configurable date format ─────────────────────────────────────────────────

let dateFormatStr = "MM/dd/yyyy";

/** Update the global date format. Called from preferencesStore. */
export function setDateFormat(fmt: string) {
  dateFormatStr = fmt;
}

/** Strip the year portion from a date format to get a short format. */
function getShortFormat(fmt: string): string {
  // Remove year patterns and surrounding separators
  return fmt
    .replace(/[/.\-\s]*yyyy[/.\-\s]*/g, "")
    .replace(/[/.\-\s]*$/, "")
    .trim();
}

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

/** YYYYMMDD → formatted with short date (no year), e.g. "03/02" or "02/03" */
export function formatDate(d: number): string {
  return format(intToDate(d), getShortFormat(dateFormatStr));
}

/** YYYYMMDD → formatted with full date format from preferences, e.g. "03/02/2025" */
export function formatDateLong(d: number): string {
  return format(intToDate(d), dateFormatStr);
}

/** YYYYMMDD → human-readable with month name, e.g. "March 23, 2025" */
export function formatDateHuman(d: number): string {
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

/** "YYYY-MM" → "March 2025" (locale-aware via Intl) */
export function formatMonth(month: string, locale?: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(locale ?? "en", {
    month: "long",
    year: "numeric",
  });
}

/** "YYYY-MM" → YYYYMM integer. */
export function monthToInt(month: string): number {
  return parseInt(month.replace("-", ""), 10);
}

/** YYYYMMDD integer for the 1st of the current month (e.g. 20260301). */
export function startOfMonthInt(): number {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return parseInt(`${y}${m}01`, 10);
}

/** YYYYMMDD integer for the last day of the current month (e.g. 20260331). */
export function endOfMonthInt(): number {
  const d = new Date();
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return parseInt(`${d.getFullYear()}${m}${String(lastDay).padStart(2, "0")}`, 10);
}
