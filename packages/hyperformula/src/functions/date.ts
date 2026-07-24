/**
 * Date built-ins. Dates are serial numbers (see dates.ts); components are read
 * with serialToDate and arithmetic is done in the calendar then re-serialized.
 */

import {
  dateToSerial,
  nowSerial,
  parseDateToSerial,
  serialToDate,
  serialWeekday,
  todaySerial,
} from "../dates";
import { ProcedureAst } from "../parser";
import { FunctionArgumentType as T, FunctionPlugin, ImplementedFunctions } from "../plugin";
import { InterpreterState } from "../typings/interpreter/InterpreterState";
import { numError, valueError } from "./helpers";

function isLeap(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export class DatePlugin extends FunctionPlugin {
  date(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(
      ast.args,
      state,
      this.metadata("DATE"),
      (y: number, m: number, d: number) =>
        dateToSerial(Math.trunc(y), Math.trunc(m), Math.trunc(d)),
    );
  }
  datevalue(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(ast.args, state, this.metadata("DATEVALUE"), (s: string) => {
      const serial = parseDateToSerial(s, this.config.dateFormats);
      return serial === undefined ? valueError() : serial;
    });
  }
  day(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(
      ast.args,
      state,
      this.metadata("DAY"),
      (s: number) => serialToDate(s).day,
    );
  }
  month(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(
      ast.args,
      state,
      this.metadata("MONTH"),
      (s: number) => serialToDate(s).month,
    );
  }
  year(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(
      ast.args,
      state,
      this.metadata("YEAR"),
      (s: number) => serialToDate(s).year,
    );
  }
  days(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(
      ast.args,
      state,
      this.metadata("DAYS"),
      (end: number, start: number) => Math.trunc(end) - Math.trunc(start),
    );
  }
  edate(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(
      ast.args,
      state,
      this.metadata("EDATE"),
      (s: number, months: number) => {
        const { year, month, day } = serialToDate(s);
        const idx = month - 1 + Math.trunc(months); // 0-based target month
        const y = year + Math.floor(idx / 12);
        const m = (((idx % 12) + 12) % 12) + 1;
        // Clamp the day to the target month's last day (Excel behaviour).
        const lastDay = daysInMonth(y, m - 1);
        return dateToSerial(y, m, Math.min(day, lastDay));
      },
    );
  }
  eomonth(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(
      ast.args,
      state,
      this.metadata("EOMONTH"),
      (s: number, months: number) => {
        const { year, month } = serialToDate(s);
        // day 0 of next month = last day of target month
        return dateToSerial(year, month + Math.trunc(months) + 1, 0);
      },
    );
  }
  today(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(ast.args, state, this.metadata("TODAY"), () => todaySerial());
  }
  now(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(ast.args, state, this.metadata("NOW"), () => nowSerial());
  }
  weekday(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(ast.args, state, this.metadata("WEEKDAY"), (s: number, type = 1) => {
      const dow = serialWeekday(s); // 0=Sun..6=Sat
      switch (type) {
        case 1:
          return dow + 1; // Sun=1..Sat=7
        case 2:
          return ((dow + 6) % 7) + 1; // Mon=1..Sun=7
        case 3:
          return (dow + 6) % 7; // Mon=0..Sun=6
        default:
          return dow + 1;
      }
    });
  }
  weeknum(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(ast.args, state, this.metadata("WEEKNUM"), (s: number, type = 1) => {
      const { year } = serialToDate(s);
      const jan1 = dateToSerial(year, 1, 1);
      const jan1Dow = serialWeekday(jan1); // 0=Sun
      const startOffset = type === 2 ? (jan1Dow + 6) % 7 : jan1Dow;
      const days = Math.trunc(s) - jan1;
      return Math.floor((days + startOffset) / 7) + 1;
    });
  }
  isoweeknum(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(ast.args, state, this.metadata("ISOWEEKNUM"), (s: number) => {
      const serial = Math.trunc(s);
      const dow = (serialWeekday(serial) + 6) % 7; // Mon=0..Sun=6
      const thursday = serial - dow + 3;
      const { year } = serialToDate(thursday);
      const jan1 = dateToSerial(year, 1, 1);
      return Math.floor((thursday - jan1) / 7) + 1;
    });
  }
  networkdays(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(
      ast.args,
      state,
      this.metadata("NETWORKDAYS"),
      (start: number, end: number) => {
        let a = Math.trunc(start);
        let b = Math.trunc(end);
        const sign = a <= b ? 1 : -1;
        if (a > b) {
          [a, b] = [b, a];
        }
        let count = 0;
        for (let d = a; d <= b; d++) {
          const dow = serialWeekday(d);
          if (dow !== 0 && dow !== 6) {
            count++;
          }
        }
        return count * sign;
      },
    );
  }
  datedif(ast: ProcedureAst, state: InterpreterState) {
    return this.runFunction(
      ast.args,
      state,
      this.metadata("DATEDIF"),
      (start: number, end: number, unit: string) => {
        const s = serialToDate(start);
        const e = serialToDate(end);
        if (end < start) return numError();
        switch (unit.toUpperCase()) {
          case "Y":
            return (
              e.year -
              s.year -
              (e.month < s.month || (e.month === s.month && e.day < s.day) ? 1 : 0)
            );
          case "M": {
            let months = (e.year - s.year) * 12 + (e.month - s.month);
            if (e.day < s.day) months--;
            return months;
          }
          case "D":
            return Math.trunc(end) - Math.trunc(start);
          case "MD": {
            const day = e.day - s.day;
            return day < 0 ? day + daysInMonth(e.year, e.month - 1) : day;
          }
          case "YM": {
            let m = e.month - s.month;
            if (e.day < s.day) m--;
            return (m + 12) % 12;
          }
          case "YD": {
            const startThisYear = dateToSerial(e.year, s.month, s.day);
            const base =
              startThisYear > Math.trunc(end)
                ? dateToSerial(e.year - 1, s.month, s.day)
                : startThisYear;
            return Math.trunc(end) - base;
          }
          default:
            return numError();
        }
      },
    );
  }
}

function daysInMonth(year: number, month: number): number {
  const days = [31, isLeap(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return days[((month % 12) + 12) % 12];
}

const num = { argumentType: T.NUMBER } as const;

DatePlugin.implementedFunctions = {
  DATE: { method: "date", parameters: [num, num, num] },
  DATEVALUE: { method: "datevalue", parameters: [{ argumentType: T.STRING }] },
  DAY: { method: "day", parameters: [num] },
  MONTH: { method: "month", parameters: [num] },
  YEAR: { method: "year", parameters: [num] },
  DAYS: { method: "days", parameters: [num, num] },
  EDATE: { method: "edate", parameters: [num, num] },
  EOMONTH: { method: "eomonth", parameters: [num, num] },
  TODAY: { method: "today", parameters: [] },
  NOW: { method: "now", parameters: [] },
  WEEKDAY: { method: "weekday", parameters: [num, { argumentType: T.NUMBER, defaultValue: 1 }] },
  WEEKNUM: { method: "weeknum", parameters: [num, { argumentType: T.NUMBER, defaultValue: 1 }] },
  ISOWEEKNUM: { method: "isoweeknum", parameters: [num] },
  NETWORKDAYS: { method: "networkdays", parameters: [num, num] },
  DATEDIF: { method: "datedif", parameters: [num, num, { argumentType: T.STRING }] },
} satisfies ImplementedFunctions;
