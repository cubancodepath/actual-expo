import { describe, expect, it } from "vitest";
import { cumulativeByMonth } from "../useNetWorth";

// monthEnds are YYYYMMDD ints (last day of each month), ascending.
// rows are per-month sums keyed by YYYYMM bucket (matches the SQL
// SUBSTR(date, 1, 6) grouping used by the live query).

describe("cumulativeByMonth", () => {
  it("accumulates steady activity each month", () => {
    const rows = [
      { bucket: 202401, sum: 100 },
      { bucket: 202402, sum: 100 },
      { bucket: 202403, sum: 100 },
    ];
    const monthEnds = [20240131, 20240229, 20240331];
    expect(cumulativeByMonth(rows, monthEnds, 500)).toEqual([600, 700, 800]);
  });

  it("carries the previous cumulative value through empty months", () => {
    const rows = [
      { bucket: 202401, sum: 100 },
      // 202402 has no transactions
      { bucket: 202403, sum: 50 },
    ];
    const monthEnds = [20240131, 20240229, 20240331];
    expect(cumulativeByMonth(rows, monthEnds, 0)).toEqual([100, 100, 150]);
  });

  it("uses priorTotal alone when all activity happened before the window", () => {
    const rows: Array<{ bucket: number; sum: number }> = [];
    const monthEnds = [20240131, 20240229, 20240331];
    expect(cumulativeByMonth(rows, monthEnds, 1000)).toEqual([1000, 1000, 1000]);
  });

  it("handles negative running totals", () => {
    const rows = [
      { bucket: 202401, sum: -200 },
      { bucket: 202402, sum: -100 },
      { bucket: 202403, sum: 300 },
    ];
    const monthEnds = [20240131, 20240229, 20240331];
    expect(cumulativeByMonth(rows, monthEnds, 500)).toEqual([300, 200, 500]);
  });

  it("returns all zeros for an empty account set", () => {
    const rows: Array<{ bucket: number; sum: number }> = [];
    const monthEnds = [20240131, 20240229, 20240331];
    expect(cumulativeByMonth(rows, monthEnds, 0)).toEqual([0, 0, 0]);
  });

  it("mixes empty leading months with later activity", () => {
    const rows = [{ bucket: 202403, sum: 75 }];
    const monthEnds = [20240131, 20240229, 20240331];
    expect(cumulativeByMonth(rows, monthEnds, 200)).toEqual([200, 200, 275]);
  });
});
