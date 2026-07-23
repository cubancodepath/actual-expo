import { describe, it, expect } from "vitest";
import { parseDate } from "@/core/shared/schedules";
import {
  projectForecastData,
  buildForecastDateContext,
  dayRangeInclusive,
} from "../forecast-projection";
import type { AccountWithComputedBalance, ForecastScheduleOccurrence } from "@/core/types/models";

/**
 * Pure projection unit test — mirror of upstream forecast-projection.test.ts.
 * Seed = Σ posted amounts before the start (NOT balance_current); posted +
 * scheduled deltas combine into a running balance; combined lowest balance.
 */
describe("projectForecastData", () => {
  it("seeds from pre-start transactions and folds posted + scheduled deltas", () => {
    const accounts: AccountWithComputedBalance[] = [
      { id: "a", name: "Checking", closed: 0, offbudget: 0, balance_current: 70 },
    ];
    const transactions = [
      { account: "a", date: "2020-03-01", amount: 100 }, // before start → seed
      { account: "a", date: "2020-03-03", amount: -40 }, // posted future
    ];
    const occ: ForecastScheduleOccurrence = {
      transaction: { account: "a", date: "2020-03-02", amount: 10 },
      account: "a",
      date: "2020-03-02",
      amount: 10,
      payee: "Paycheck",
      scheduleId: "s1",
      scheduleName: "Paycheck",
    };
    const dateContext = {
      forecastStartDate: "2020-03-02",
      forecastEndDate: "2020-03-04",
      forecastDays: ["2020-03-02", "2020-03-03", "2020-03-04"],
      firstForecastDate: "2020-03-02",
      endDateObj: parseDate("2020-03-04"),
    };

    const { dataPoints, lowestBalance } = projectForecastData({
      accounts,
      transactions,
      futureOccurrences: [occ],
      filterMatch: () => true,
      dateContext,
    });

    expect(dataPoints.map((p) => p.balance)).toEqual([110, 70, 70]);
    expect(dataPoints[0].transactions).toHaveLength(1); // occurrence surfaced
    expect(dataPoints[1].transactions).toHaveLength(0);
    expect(lowestBalance).toMatchObject({ date: "2020-03-03", balance: 70 });
  });

  it("ignores occurrences before firstForecastDate", () => {
    const accounts: AccountWithComputedBalance[] = [
      { id: "a", name: "A", closed: 0, offbudget: 0, balance_current: 0 },
    ];
    const occ: ForecastScheduleOccurrence = {
      transaction: {},
      account: "a",
      date: "2020-03-01", // before firstForecastDate
      amount: 999,
      payee: "x",
      scheduleId: "s",
      scheduleName: "x",
    };
    const { dataPoints } = projectForecastData({
      accounts,
      transactions: [],
      futureOccurrences: [occ],
      filterMatch: () => true,
      dateContext: {
        forecastStartDate: "2020-03-02",
        forecastEndDate: "2020-03-03",
        forecastDays: ["2020-03-02", "2020-03-03"],
        firstForecastDate: "2020-03-02",
        endDateObj: parseDate("2020-03-03"),
      },
    });
    expect(dataPoints.every((p) => p.balance === 0)).toBe(true);
  });
});

describe("dayRangeInclusive / buildForecastDateContext", () => {
  it("lists every day inclusive", () => {
    expect(dayRangeInclusive("2020-01-30", "2020-02-02")).toEqual([
      "2020-01-30",
      "2020-01-31",
      "2020-02-01",
      "2020-02-02",
    ]);
  });

  it("defaults the horizon to 12 months and firstForecastDate to max(start, today)", () => {
    const ctx = buildForecastDateContext("2099-01-01", "2099-03-31");
    expect(ctx.forecastDays[0]).toBe("2099-01-01");
    expect(ctx.forecastDays.at(-1)).toBe("2099-03-31");
    expect(ctx.firstForecastDate).toBe("2099-01-01"); // today < 2099
  });
});
