// Pure-function checks for the Age of Money port — a representative subset of the
// upstream loot-core suite. FIFO age matching, rolling average, trend, and
// income/expense classification. No DB (these functions take plain arrays).
import { describe, expect, it } from "vitest";
import type { Transaction, TransactionWithCategory } from "../age-of-money-spreadsheet";
import {
  calculateAgeOfMoney,
  calculateAverageAge,
  calculateTrend,
  classifyTransactions,
  formatPeriodLabel,
} from "../age-of-money-spreadsheet";

describe("calculateAgeOfMoney (FIFO)", () => {
  it("ages a single expense against a single income bucket", () => {
    const income: Transaction[] = [{ id: "1", date: "2024-01-01", amount: 1000 }];
    const expenses: Transaction[] = [{ id: "2", date: "2024-01-15", amount: -500 }];
    const result = calculateAgeOfMoney(income, expenses);
    expect(result.ages).toHaveLength(1);
    expect(result.ages[0].age).toBe(14);
    expect(result.insufficientData).toBe(false);
  });

  it("uses the oldest income first", () => {
    const income: Transaction[] = [
      { id: "1", date: "2024-01-01", amount: 500 },
      { id: "2", date: "2024-01-15", amount: 500 },
    ];
    const expenses: Transaction[] = [{ id: "3", date: "2024-02-01", amount: -400 }];
    expect(calculateAgeOfMoney(income, expenses).ages[0].age).toBe(31);
  });

  it("spans multiple buckets, ages against the last one drawn", () => {
    const income: Transaction[] = [
      { id: "1", date: "2024-01-01", amount: 200 },
      { id: "2", date: "2024-01-15", amount: 300 },
    ];
    const expenses: Transaction[] = [{ id: "3", date: "2024-02-01", amount: -400 }];
    expect(calculateAgeOfMoney(income, expenses).ages[0].age).toBe(17);
  });

  it("consumes one bucket across sequential expenses", () => {
    const income: Transaction[] = [{ id: "1", date: "2024-01-01", amount: 1000 }];
    const expenses: Transaction[] = [
      { id: "2", date: "2024-01-10", amount: -300 },
      { id: "3", date: "2024-01-20", amount: -300 },
      { id: "4", date: "2024-01-30", amount: -300 },
    ];
    const { ages } = calculateAgeOfMoney(income, expenses);
    expect(ages.map((a) => a.age)).toEqual([9, 19, 29]);
  });

  it("flags insufficient data when expenses exceed income", () => {
    const income: Transaction[] = [{ id: "1", date: "2024-01-01", amount: 100 }];
    const expenses: Transaction[] = [{ id: "2", date: "2024-01-15", amount: -500 }];
    expect(calculateAgeOfMoney(income, expenses).insufficientData).toBe(true);
  });

  it("age is 0 for same-day income and expense", () => {
    const income: Transaction[] = [{ id: "1", date: "2024-01-15", amount: 1000 }];
    const expenses: Transaction[] = [{ id: "2", date: "2024-01-15", amount: -500 }];
    expect(calculateAgeOfMoney(income, expenses).ages[0].age).toBe(0);
  });

  it("sorts by date regardless of input order", () => {
    const income: Transaction[] = [
      { id: "2", date: "2024-01-15", amount: 500 },
      { id: "1", date: "2024-01-01", amount: 500 },
    ];
    const expenses: Transaction[] = [
      { id: "4", date: "2024-02-15", amount: -200 },
      { id: "3", date: "2024-02-01", amount: -200 },
    ];
    const { ages } = calculateAgeOfMoney(income, expenses);
    expect(ages).toEqual([
      { date: "2024-02-01", age: 31 },
      { date: "2024-02-15", age: 45 },
    ]);
  });
});

describe("calculateAverageAge", () => {
  it("returns null for empty input", () => {
    expect(calculateAverageAge([])).toBeNull();
  });

  it("averages the last N ages, rounded", () => {
    const ages = [
      { date: "2024-01-01", age: 5 },
      { date: "2024-01-02", age: 10 },
      { date: "2024-01-03", age: 15 },
      { date: "2024-01-04", age: 20 },
      { date: "2024-01-05", age: 25 },
    ];
    expect(calculateAverageAge(ages, 3)).toBe(20); // (15+20+25)/3
  });
});

describe("calculateTrend", () => {
  it("is stable with fewer than two points", () => {
    expect(calculateTrend([])).toBe("stable");
    expect(calculateTrend([{ date: "Jan 2024", ageOfMoney: 30 }])).toBe("stable");
  });

  it("is up/down past the threshold, stable within it", () => {
    expect(
      calculateTrend([
        { date: "Jan 2024", ageOfMoney: 20 },
        { date: "Feb 2024", ageOfMoney: 25 },
      ]),
    ).toBe("up");
    expect(
      calculateTrend([
        { date: "Jan 2024", ageOfMoney: 30 },
        { date: "Feb 2024", ageOfMoney: 25 },
      ]),
    ).toBe("down");
    expect(
      calculateTrend([
        { date: "Jan 2024", ageOfMoney: 30 },
        { date: "Feb 2024", ageOfMoney: 31 },
      ]),
    ).toBe("stable");
  });
});

describe("classifyTransactions", () => {
  it("splits by amount sign (refunds count as income)", () => {
    const txns: TransactionWithCategory[] = [
      { id: "1", date: "2024-01-01", amount: 3000, categoryIsIncome: true },
      { id: "2", date: "2024-01-05", amount: -150, categoryIsIncome: false },
      { id: "3", date: "2024-01-10", amount: 25, categoryIsIncome: false },
    ];
    const { income, expenses } = classifyTransactions(txns);
    expect(income.map((t) => t.id)).toEqual(["1", "3"]);
    expect(expenses.map((t) => t.id)).toEqual(["2"]);
  });
});

describe("formatPeriodLabel", () => {
  it("formats a monthly period key", () => {
    expect(formatPeriodLabel("2024-01", "monthly")).toBe("Jan 2024");
  });
});
