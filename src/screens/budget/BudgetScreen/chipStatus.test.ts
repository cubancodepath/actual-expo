import { describe, expect, it } from "vitest";
import { categoryChipStatus } from "./chipStatus";

const base = {
  balance: 0,
  budgeted: 0,
  goal: null as number | null,
  longGoal: false,
  goalsEnabled: true,
};

describe("categoryChipStatus", () => {
  it("negative balance is danger, even with a funded goal", () => {
    expect(categoryChipStatus({ ...base, balance: -100 })).toBe("danger");
    expect(categoryChipStatus({ ...base, balance: -1, budgeted: 5000, goal: 5000 })).toBe("danger");
  });

  it("without a goal, colours by sign", () => {
    expect(categoryChipStatus({ ...base, balance: 500 })).toBe("success");
    expect(categoryChipStatus({ ...base, balance: 0 })).toBe("default");
    expect(categoryChipStatus({ ...base, goal: 0, balance: 300 })).toBe("success");
  });

  it("goals disabled → by sign even with a goal", () => {
    expect(
      categoryChipStatus({ ...base, goalsEnabled: false, goal: 5000, budgeted: 0, balance: 100 }),
    ).toBe("success");
  });

  it("monthly goal: funded when budgeted ≥ goal, else warning", () => {
    expect(categoryChipStatus({ ...base, goal: 5000, budgeted: 5000, balance: 5000 })).toBe(
      "success",
    );
    expect(categoryChipStatus({ ...base, goal: 5000, budgeted: 3000, balance: 3000 })).toBe(
      "warning",
    );
  });

  it("long goal: funded when balance ≥ goal, else warning", () => {
    expect(
      categoryChipStatus({
        ...base,
        longGoal: true,
        goal: 100000,
        budgeted: 2000,
        balance: 100000,
      }),
    ).toBe("success");
    expect(
      categoryChipStatus({ ...base, longGoal: true, goal: 100000, budgeted: 2000, balance: 40000 }),
    ).toBe("warning");
  });

  it("balance 0 with a funded budgeted goal → success (not neutral)", () => {
    expect(categoryChipStatus({ ...base, goal: 5000, budgeted: 5000, balance: 0 })).toBe("success");
  });
});
