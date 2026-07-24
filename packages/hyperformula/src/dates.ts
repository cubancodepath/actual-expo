/**
 * Date model — HyperFormula represents dates as serial numbers with the default
 * nullDate 1899-12-30 (serial 0). Strings matching one of `config.dateFormats`
 * are parsed to serials on entry (see hyperformula.ts addNamedExpression /
 * setCellContents), and TEXT()/date functions convert back.
 *
 * The 1900 leap-year bug is not modelled: Actual only ever handles modern
 * dates, for which day-count from 1899-12-30 is Excel-compatible.
 */

const MS_PER_DAY = 86_400_000;
const EPOCH_MS = Date.UTC(1899, 11, 30); // 1899-12-30

export type YMD = { year: number; month: number; day: number };

/** Days from 1899-12-30 for a given calendar date (month 1-12, overflow ok). */
export function dateToSerial(year: number, month: number, day: number): number {
  const ms = Date.UTC(year, month - 1, day);
  return Math.round((ms - EPOCH_MS) / MS_PER_DAY);
}

/** Inverse of dateToSerial. */
export function serialToDate(serial: number): YMD {
  const ms = EPOCH_MS + Math.round(serial) * MS_PER_DAY;
  const d = new Date(ms);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

/** Day-of-week, 0 = Sunday … 6 = Saturday, for a serial. */
export function serialWeekday(serial: number): number {
  const ms = EPOCH_MS + Math.round(serial) * MS_PER_DAY;
  return new Date(ms).getUTCDay();
}

function isValidYMD(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1 || d > 31) {
    return false;
  }
  const ms = Date.UTC(y, m - 1, d);
  const back = new Date(ms);
  return back.getUTCFullYear() === y && back.getUTCMonth() === m - 1 && back.getUTCDate() === d;
}

/**
 * Parse `input` against a single format token string (e.g. "YYYY-MM-DD"). The
 * format uses YYYY/YY, MM/M, DD/D, and literal separators. Returns YMD or null.
 */
function parseWithFormat(input: string, format: string): YMD | null {
  let year = 0;
  let month = 0;
  let day = 0;
  let i = 0; // index into input
  let f = 0; // index into format

  const readNumber = (maxLen: number): number | null => {
    let s = "";
    while (i < input.length && input[i] >= "0" && input[i] <= "9" && s.length < maxLen) {
      s += input[i++];
    }
    return s.length === 0 ? null : parseInt(s, 10);
  };

  while (f < format.length) {
    const ch = format[f];
    if (ch === "Y") {
      let len = 0;
      while (format[f] === "Y") {
        f++;
        len++;
      }
      const val = readNumber(4);
      if (val === null) {
        return null;
      }
      year = len <= 2 && val < 100 ? 2000 + val : val;
    } else if (ch === "M") {
      while (format[f] === "M") {
        f++;
      }
      const val = readNumber(2);
      if (val === null) {
        return null;
      }
      month = val;
    } else if (ch === "D") {
      while (format[f] === "D") {
        f++;
      }
      const val = readNumber(2);
      if (val === null) {
        return null;
      }
      day = val;
    } else {
      // literal separator — must match exactly
      if (input[i] !== ch) {
        return null;
      }
      i++;
      f++;
    }
  }

  if (i !== input.length) {
    return null;
  }
  if (!isValidYMD(year, month, day)) {
    return null;
  }
  return { year, month, day };
}

/**
 * Try to parse `input` as a date against the configured formats. Returns the
 * serial number or undefined if it matches none.
 */
export function parseDateToSerial(input: string, formats: string[]): number | undefined {
  const trimmed = input.trim();
  for (const format of formats) {
    const ymd = parseWithFormat(trimmed, format);
    if (ymd) {
      return dateToSerial(ymd.year, ymd.month, ymd.day);
    }
  }
  return undefined;
}

function pad(n: number, len: number): string {
  const s = String(Math.abs(n));
  return (n < 0 ? "-" : "") + s.padStart(len, "0");
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Format a serial with a TEXT-style token string (YYYY, MM, DD, etc.). */
export function formatSerial(serial: number, format: string): string {
  const { year, month, day } = serialToDate(serial);
  const weekday = serialWeekday(serial);
  let out = "";
  let f = 0;
  while (f < format.length) {
    if (format.startsWith("YYYY", f)) {
      out += pad(year, 4);
      f += 4;
    } else if (format.startsWith("YY", f)) {
      out += pad(year % 100, 2);
      f += 2;
    } else if (format.startsWith("MMMM", f)) {
      out += MONTH_NAMES[month - 1];
      f += 4;
    } else if (format.startsWith("MMM", f)) {
      out += MONTH_NAMES[month - 1].slice(0, 3);
      f += 3;
    } else if (format.startsWith("MM", f)) {
      out += pad(month, 2);
      f += 2;
    } else if (format.startsWith("M", f)) {
      out += String(month);
      f += 1;
    } else if (format.startsWith("DDDD", f)) {
      out += DAY_NAMES[weekday];
      f += 4;
    } else if (format.startsWith("DDD", f)) {
      out += DAY_NAMES[weekday].slice(0, 3);
      f += 3;
    } else if (format.startsWith("DD", f)) {
      out += pad(day, 2);
      f += 2;
    } else if (format.startsWith("D", f)) {
      out += String(day);
      f += 1;
    } else {
      out += format[f];
      f += 1;
    }
  }
  return out;
}

/** Current date as a serial (local time, midnight). */
export function todaySerial(): number {
  const now = new Date();
  return dateToSerial(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

/** Current date+time as a fractional serial. */
export function nowSerial(): number {
  const now = new Date();
  const daySerial = dateToSerial(now.getFullYear(), now.getMonth() + 1, now.getDate());
  const frac = (now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()) / 86400;
  return daySerial + frac;
}
