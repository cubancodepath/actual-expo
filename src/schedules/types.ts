/** Schedule domain types — matches original Actual Budget format */

export type RecurPattern = {
  value: number;
  type: "SU" | "MO" | "TU" | "WE" | "TH" | "FR" | "SA" | "day";
};

export type RecurConfig = {
  frequency: "daily" | "weekly" | "monthly" | "yearly";
  interval?: number;
  patterns?: RecurPattern[];
  skipWeekend?: boolean;
  start: string; // 'YYYY-MM-DD'
  endMode?: "never" | "after_n_occurrences" | "on_date";
  endOccurrences?: number;
  endDate?: string; // 'YYYY-MM-DD'
  weekendSolveMode?: "before" | "after";
};

export type ScheduleStatus = "upcoming" | "due" | "paid" | "missed" | "scheduled" | "completed";

export type Schedule = {
  id: string;
  name: string | null;
  rule: string;
  completed: boolean;
  posts_transaction: boolean;
  tombstone: boolean;
  // Derived from schedules_next_date
  next_date: string | null; // 'YYYY-MM-DD'
  // Derived from rule conditions
  _payee: string | null;
  _account: string | null;
  _amount: number | { num1: number; num2: number } | null;
  _amountOp: string | null;
  _date: RecurConfig | string | null;
  _category: string | null;
  _conditions: RuleCondition[];
};

import type { RuleCondition, RuleAction } from "../rules/types";
export type { RuleCondition, RuleAction };
