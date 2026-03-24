import { describe, it, expect } from "vitest";
import { computeProgressBar, isGoalFunded, type ProgressBarResult } from "./progressBar";
import type { BudgetCategory } from "../budgets/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCat(overrides: Partial<BudgetCategory>): BudgetCategory {
  return {
    id: "test",
    name: "Test",
    budgeted: 0,
    spent: 0,
    balance: 0,
    carryIn: 0,
    carryover: false,
    goal: null,
    longGoal: false,
    goalDef: null,
    hidden: false,
    ...overrides,
  };
}

// goalDef builders — templates are stored as JSON arrays
const goalDef = {
  monthly: (monthly: number) =>
    JSON.stringify([{ type: "simple", monthly, priority: 0, directive: "template" }]),
  savings: (amount: number) => JSON.stringify([{ type: "goal", amount, directive: "goal" }]),
  sinkingFund: (amount: number, month: string) =>
    JSON.stringify([{ type: "by", amount, month, priority: 0, directive: "template" }]),
  limit: (amount: number) =>
    JSON.stringify([
      { type: "limit", amount, hold: false, period: "monthly", directive: "template" },
    ]),
  refill: () => JSON.stringify([{ type: "refill", priority: 0, directive: "template" }]),
};

// ═══════════════════════════════════════════════════════════════════════════
// Limit goal
// ═══════════════════════════════════════════════════════════════════════════

describe("computeProgressBar — limit goal", () => {
  it("under 80% spent → healthy, spent ratio reflects actual spending", () => {
    // goal = $100 (10000 cents), spent = $50 → ratio = 0.5
    const cat = makeCat({ goal: 10000, spent: -5000, goalDef: goalDef.limit(100) });
    const result = computeProgressBar(cat);

    expect(result.spent).toBeCloseTo(0.5);
    expect(result.available).toBe(1);
    expect(result.overspent).toBe(false);
    expect(result.barStatus).toBe("healthy");
    expect(result.pillStatus).toBe("healthy");
    expect(result.striped).toBe(true);
  });

  it("80–99% spent → caution", () => {
    // goal = $100, spent = $85 → ratio = 0.85
    const cat = makeCat({ goal: 10000, spent: -8500, goalDef: goalDef.limit(100) });
    const result = computeProgressBar(cat);

    expect(result.spent).toBeCloseTo(0.85);
    expect(result.barStatus).toBe("caution");
    expect(result.pillStatus).toBe("caution");
    expect(result.overspent).toBe(false);
  });

  it("100%+ spent → overspent", () => {
    // goal = $100, spent = $120 → ratio = 1.2, capped at 1
    const cat = makeCat({ goal: 10000, spent: -12000, goalDef: goalDef.limit(100) });
    const result = computeProgressBar(cat);

    expect(result.spent).toBe(1);
    expect(result.overspent).toBe(true);
    expect(result.barStatus).toBe("overspent");
    expect(result.pillStatus).toBe("overspent");
  });

  it("zero spending → healthy, available=1", () => {
    const cat = makeCat({ goal: 10000, spent: 0, goalDef: goalDef.limit(100) });
    const result = computeProgressBar(cat);

    expect(result.spent).toBe(0);
    expect(result.available).toBe(1);
    expect(result.overspent).toBe(false);
    expect(result.barStatus).toBe("healthy");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Savings (#goal)
// ═══════════════════════════════════════════════════════════════════════════

describe("computeProgressBar — savings (#goal)", () => {
  it("partially saved → bar reflects balance/goal ratio, pillStatus caution", () => {
    // goal = $5000 (500000 cents), balance = $1000 → 20%
    const cat = makeCat({
      goal: 500000,
      longGoal: true,
      balance: 100000,
      goalDef: goalDef.savings(5000),
    });
    const result = computeProgressBar(cat);

    expect(result.spent).toBeCloseTo(0.2);
    expect(result.available).toBeCloseTo(0.2);
    expect(result.overspent).toBe(false);
    expect(result.striped).toBe(false);
    expect(result.barStatus).toBe("healthy");
    expect(result.pillStatus).toBe("caution");
  });

  it("fully saved → bar=1, pillStatus healthy", () => {
    const cat = makeCat({
      goal: 500000,
      longGoal: true,
      balance: 500000,
      goalDef: goalDef.savings(5000),
    });
    const result = computeProgressBar(cat);

    expect(result.spent).toBe(1);
    expect(result.available).toBe(1);
    expect(result.overspent).toBe(false);
    expect(result.barStatus).toBe("healthy");
    expect(result.pillStatus).toBe("healthy");
  });

  it("negative balance → overspent", () => {
    const cat = makeCat({
      goal: 500000,
      longGoal: true,
      balance: -10000,
      goalDef: goalDef.savings(5000),
    });
    const result = computeProgressBar(cat);

    expect(result.overspent).toBe(true);
    expect(result.barStatus).toBe("overspent");
    expect(result.pillStatus).toBe("overspent");
    expect(result.striped).toBe(false);
  });

  it("zero balance → bar=0, pillStatus caution", () => {
    const cat = makeCat({
      goal: 500000,
      longGoal: true,
      balance: 0,
      goalDef: goalDef.savings(5000),
    });
    const result = computeProgressBar(cat);

    expect(result.spent).toBe(0);
    expect(result.available).toBe(0);
    expect(result.overspent).toBe(false);
    expect(result.pillStatus).toBe("caution");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Sinking fund (by)
// ═══════════════════════════════════════════════════════════════════════════

describe("computeProgressBar — sinking fund (by)", () => {
  it("on track (budgeted >= goal) → healthy", () => {
    // goal = $1200 by 2026-12, monthly installment = $120 (12000 cents)
    // balance = 12000 cents → savedPct = 12000/120000 = 0.1
    const cat = makeCat({
      goal: 12000,
      budgeted: 12000,
      balance: 12000,
      goalDef: goalDef.sinkingFund(1200, "2026-12"),
    });
    const result = computeProgressBar(cat);

    expect(result.overspent).toBe(false);
    expect(result.striped).toBe(false);
    expect(result.barStatus).toBe("healthy");
    expect(result.pillStatus).toBe("healthy");
  });

  it("underfunded (budgeted < goal) → caution", () => {
    const cat = makeCat({
      goal: 12000,
      budgeted: 5000,
      balance: 5000,
      goalDef: goalDef.sinkingFund(1200, "2026-12"),
    });
    const result = computeProgressBar(cat);

    expect(result.overspent).toBe(false);
    expect(result.barStatus).toBe("caution");
    expect(result.pillStatus).toBe("caution");
    expect(result.striped).toBe(false);
  });

  it("negative balance → overspent", () => {
    const cat = makeCat({
      goal: 12000,
      budgeted: 0,
      balance: -5000,
      goalDef: goalDef.sinkingFund(1200, "2026-12"),
    });
    const result = computeProgressBar(cat);

    expect(result.overspent).toBe(true);
    expect(result.barStatus).toBe("overspent");
    expect(result.pillStatus).toBe("overspent");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Monthly goal (simple template)
// ═══════════════════════════════════════════════════════════════════════════

describe("computeProgressBar — monthly goal (simple)", () => {
  it("funded, no spending → available shows funded amount, healthy", () => {
    // goal = $200 (20000 cents), budgeted = 20000, balance = 20000, spent = 0
    // available = (0 + 20000) / 20000 = 1
    const cat = makeCat({
      goal: 20000,
      budgeted: 20000,
      balance: 20000,
      spent: 0,
      goalDef: goalDef.monthly(200),
    });
    const result = computeProgressBar(cat);

    expect(result.spent).toBe(0);
    expect(result.available).toBe(1);
    expect(result.overspent).toBe(false);
    expect(result.barStatus).toBe("healthy");
    expect(result.pillStatus).toBe("healthy");
    expect(result.striped).toBe(true);
  });

  it("funded, partial spending → spent and available correct", () => {
    // goal = 20000, budgeted = 20000, spent = -5000, balance = 15000
    // spent ratio = 5000/20000 = 0.25
    // available = (5000 + 15000) / 20000 = 1
    const cat = makeCat({
      goal: 20000,
      budgeted: 20000,
      balance: 15000,
      spent: -5000,
      goalDef: goalDef.monthly(200),
    });
    const result = computeProgressBar(cat);

    expect(result.spent).toBeCloseTo(0.25);
    expect(result.available).toBe(1);
    expect(result.overspent).toBe(false);
    expect(result.barStatus).toBe("healthy");
    expect(result.pillStatus).toBe("healthy");
  });

  it("underfunded → caution", () => {
    // goal = 20000, budgeted = 10000 → funded = false
    const cat = makeCat({
      goal: 20000,
      budgeted: 10000,
      balance: 10000,
      spent: 0,
      goalDef: goalDef.monthly(200),
    });
    const result = computeProgressBar(cat);

    expect(result.overspent).toBe(false);
    expect(result.barStatus).toBe("caution");
    expect(result.pillStatus).toBe("caution");
  });

  it("overspent → overspent", () => {
    // goal = 20000, budgeted = 20000, spent = -25000, balance = -5000
    const cat = makeCat({
      goal: 20000,
      budgeted: 20000,
      balance: -5000,
      spent: -25000,
      goalDef: goalDef.monthly(200),
    });
    const result = computeProgressBar(cat);

    expect(result.overspent).toBe(true);
    expect(result.barStatus).toBe("overspent");
    expect(result.pillStatus).toBe("overspent");
  });

  it("BUG FIX: budgeted=0 with positive balance from carryover → available=0, pillStatus=caution", () => {
    // This is the key bug: when budgeted=0 and no spending, balance is pure carryover.
    // The goal is NOT funded this month — carryover should not count as "progress".
    const cat = makeCat({
      goal: 20000,
      budgeted: 0,
      balance: 15000, // entirely from carryIn
      carryIn: 15000,
      spent: 0,
      goalDef: goalDef.monthly(200),
    });
    const result = computeProgressBar(cat);

    expect(result.available).toBe(0);
    expect(result.spent).toBe(0);
    expect(result.overspent).toBe(false);
    expect(result.pillStatus).toBe("caution");
  });

  it("budgeted=0, no balance → available=0", () => {
    const cat = makeCat({
      goal: 20000,
      budgeted: 0,
      balance: 0,
      spent: 0,
      goalDef: goalDef.monthly(200),
    });
    const result = computeProgressBar(cat);

    expect(result.available).toBe(0);
    expect(result.spent).toBe(0);
  });

  it("partially funded with carryover → shows budgeted progress only", () => {
    // budgeted = 10000, goal = 20000. CarryIn doesn't affect the bar.
    const cat = makeCat({
      goal: 20000,
      budgeted: 10000,
      balance: 20000,
      carryIn: 10000,
      spent: 0,
      goalDef: goalDef.monthly(200),
    });
    const result = computeProgressBar(cat);

    // available = budgeted / goal = 10000 / 20000 = 0.5
    expect(result.available).toBe(0.5);
    // budgeted < goal → caution
    expect(result.barStatus).toBe("caution");
    expect(result.pillStatus).toBe("caution");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// No goal
// ═══════════════════════════════════════════════════════════════════════════

describe("computeProgressBar — no goal", () => {
  it("has budget, no spending → full available bar, healthy", () => {
    // budgeted = 10000, spent = 0, balance = 10000
    // base = 10000, available = (0 + 10000)/10000 = 1
    const cat = makeCat({ budgeted: 10000, balance: 10000, spent: 0 });
    const result = computeProgressBar(cat);

    expect(result.spent).toBe(0);
    expect(result.available).toBe(1);
    expect(result.overspent).toBe(false);
    expect(result.barStatus).toBe("healthy");
    expect(result.pillStatus).toBe("healthy");
    expect(result.striped).toBe(true);
  });

  it("has budget, partial spending → correct split", () => {
    // budgeted = 10000, spent = -4000, balance = 6000
    // base = 10000, spent = 4000/10000 = 0.4, available = (4000+6000)/10000 = 1
    const cat = makeCat({ budgeted: 10000, balance: 6000, spent: -4000 });
    const result = computeProgressBar(cat);

    expect(result.spent).toBeCloseTo(0.4);
    expect(result.available).toBe(1);
    expect(result.overspent).toBe(false);
    expect(result.barStatus).toBe("healthy");
  });

  it("overspent → overspent", () => {
    // budgeted = 10000, spent = -15000, balance = -5000
    const cat = makeCat({ budgeted: 10000, balance: -5000, spent: -15000 });
    const result = computeProgressBar(cat);

    expect(result.overspent).toBe(true);
    expect(result.barStatus).toBe("overspent");
    expect(result.pillStatus).toBe("overspent");
  });

  it("zero budget, zero balance → empty neutral bar", () => {
    const cat = makeCat({ budgeted: 0, balance: 0, spent: 0 });
    const result = computeProgressBar(cat);

    expect(result.spent).toBe(0);
    expect(result.available).toBe(0);
    expect(result.overspent).toBe(false);
    expect(result.barStatus).toBe("neutral");
    expect(result.pillStatus).toBe("neutral");
  });

  it("zero budget, positive balance → uses balance as base", () => {
    // budgeted = 0, balance = 5000 (e.g. pure carryover with no goal)
    // base = Math.abs(balance) = 5000
    // available = (0 + 5000)/5000 = 1
    const cat = makeCat({ budgeted: 0, balance: 5000, spent: 0 });
    const result = computeProgressBar(cat);

    expect(result.available).toBe(1);
    expect(result.overspent).toBe(false);
    expect(result.barStatus).toBe("healthy");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// isGoalFunded
// ═══════════════════════════════════════════════════════════════════════════

describe("isGoalFunded", () => {
  it("longGoal with balance >= goal → true", () => {
    const cat = makeCat({ goal: 500000, longGoal: true, balance: 500000 });
    expect(isGoalFunded(cat)).toBe(true);
  });

  it("longGoal with balance < goal → false", () => {
    const cat = makeCat({ goal: 500000, longGoal: true, balance: 100000 });
    expect(isGoalFunded(cat)).toBe(false);
  });

  it("monthly (not longGoal) with budgeted >= goal → true", () => {
    const cat = makeCat({ goal: 20000, longGoal: false, budgeted: 20000 });
    expect(isGoalFunded(cat)).toBe(true);
  });

  it("monthly (not longGoal) with budgeted < goal → false", () => {
    const cat = makeCat({ goal: 20000, longGoal: false, budgeted: 10000 });
    expect(isGoalFunded(cat)).toBe(false);
  });

  it("no goal (goal=null) → false", () => {
    const cat = makeCat({ goal: null });
    expect(isGoalFunded(cat)).toBe(false);
  });

  it("goal=0 → false", () => {
    const cat = makeCat({ goal: 0, budgeted: 10000 });
    expect(isGoalFunded(cat)).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Refill goal
// ═══════════════════════════════════════════════════════════════════════════

describe("computeProgressBar — refill goal", () => {
  it("detects as limit kind → spending ratio against goal", () => {
    // refill is treated like a limit (spending cap)
    const cat = makeCat({ goal: 50000, spent: -10000, goalDef: goalDef.refill() });
    const result = computeProgressBar(cat);

    // spentAbs = 10000, base = 50000, ratio = 0.2
    expect(result.spent).toBeCloseTo(0.2);
    expect(result.available).toBe(1);
    expect(result.barStatus).toBe("healthy");
    expect(result.striped).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Exactly-at-boundary cases
// ═══════════════════════════════════════════════════════════════════════════

describe("computeProgressBar — boundary precision", () => {
  it("limit: exactly 80% spent → caution (not healthy)", () => {
    const cat = makeCat({ goal: 10000, spent: -8000, goalDef: goalDef.limit(100) });
    const result = computeProgressBar(cat);

    expect(result.barStatus).toBe("caution");
  });

  it("savings: balance exactly equals goal → bar=1, pillStatus=healthy", () => {
    const cat = makeCat({
      goal: 100000,
      longGoal: true,
      balance: 100000,
      goalDef: goalDef.savings(1000),
    });
    const result = computeProgressBar(cat);

    expect(result.spent).toBe(1);
    expect(result.available).toBe(1);
    expect(result.pillStatus).toBe("healthy");
  });

  it("savings: balance exceeds goal → bar capped at 1", () => {
    const cat = makeCat({
      goal: 100000,
      longGoal: true,
      balance: 150000,
      goalDef: goalDef.savings(1000),
    });
    const result = computeProgressBar(cat);

    expect(result.spent).toBe(1);
    expect(result.available).toBe(1);
    expect(result.overspent).toBe(false);
    expect(result.pillStatus).toBe("healthy");
  });

  it("monthly: spent capped at 1 when spending exceeds goal", () => {
    // goal = 20000, spent = -40000 (2x the goal)
    const cat = makeCat({
      goal: 20000,
      budgeted: 20000,
      balance: -20000,
      spent: -40000,
      goalDef: goalDef.monthly(200),
    });
    const result = computeProgressBar(cat);

    expect(result.spent).toBe(1); // capped
    expect(result.overspent).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Real data tests (from user's budget DB — March 2026)
// ═══════════════════════════════════════════════════════════════════════════

describe("computeProgressBar — real budget data", () => {
  // Vacation: simple monthly=1500, budgeted=218086 (overfunded), goal=150000
  it("Vacation — overfunded monthly goal shows green", () => {
    const cat = makeCat({
      budgeted: 218086,
      spent: 0,
      balance: 218086 + 715710, // budgeted + carryIn
      carryIn: 715710,
      goal: 150000,
      goalDef: goalDef.monthly(1500),
    });
    const result = computeProgressBar(cat);
    expect(result.pillStatus).toBe("healthy");
    expect(result.barStatus).toBe("healthy");
    expect(result.available).toBe(1); // capped at 1
  });

  // Dining out: simple monthly=1000, budgeted=78836, goal=100000 (underfunded)
  it("Dining out — underfunded monthly goal shows caution", () => {
    const cat = makeCat({
      budgeted: 78836,
      spent: 0,
      balance: 78836 + 709500,
      carryIn: 709500,
      goal: 100000,
      goalDef: goalDef.monthly(1000),
    });
    const result = computeProgressBar(cat);
    expect(result.pillStatus).toBe("caution");
    expect(result.available).toBeGreaterThan(0);
  });

  // Parking & Salik: simple monthly=null, limit=200 → refill (longGoal=true)
  it("Parking & Salik — refill (up to) detected as savings, not limit", () => {
    const cat = makeCat({
      budgeted: 2400,
      spent: -2400,
      balance: 17600, // carryIn + budgeted + spent
      carryIn: 17600,
      goal: 20000, // limit.amount * 100
      longGoal: true,
      goalDef: JSON.stringify([
        {
          type: "simple",
          monthly: null,
          limit: { amount: 200, hold: null, period: "monthly", start: null },
          priority: 0,
          directive: "template",
        },
      ]),
    });
    const result = computeProgressBar(cat);
    // Should be "savings" kind (balance-based, not spending-cap)
    expect(result.striped).toBe(false); // savings = solid bar
    expect(result.pillStatus).toBe("caution"); // balance < goal
  });

  // Globals ETF: simple monthly=4000, budgeted=-332478 (negative budgeted!)
  it("Globals ETF — negative budgeted treated as unfunded", () => {
    const cat = makeCat({
      budgeted: -332478,
      spent: 0,
      balance: -332478 + 0,
      goal: 400000,
      goalDef: goalDef.monthly(4000),
    });
    const result = computeProgressBar(cat);
    expect(result.available).toBe(0);
    expect(result.pillStatus).toBe("overspent"); // negative balance
  });

  // Clothing: simple monthly=300, budgeted=0, goal=30000 (carryover bug)
  it("Clothing — budgeted=0 with carryover shows empty bar", () => {
    const cat = makeCat({
      budgeted: 0,
      spent: 0,
      balance: 0, // no carryover in this case
      goal: 30000,
      goalDef: goalDef.monthly(300),
    });
    const result = computeProgressBar(cat);
    expect(result.available).toBe(0);
    expect(result.pillStatus).toBe("caution");
  });

  // Emergency Funds: by 105000 by 2026-12 (sinking fund)
  it("Emergency Funds — sinking fund shows cumulative progress", () => {
    const cat = makeCat({
      budgeted: 1044518,
      spent: 0,
      balance: 1044518 + 12215372, // budgeted + carryIn
      carryIn: 12215372,
      goal: 1044518,
      goalDef: JSON.stringify([
        {
          type: "by",
          amount: 105000,
          month: "2026-12",
          priority: 0,
          directive: "template",
        },
      ]),
    });
    const result = computeProgressBar(cat);
    // Sinking fund: bar = balance / totalTarget, capped at 1
    expect(result.spent).toBe(1); // balance > totalTarget, capped
    expect(result.striped).toBe(false); // savings-style solid bar
    expect(result.pillStatus).toBe("healthy"); // budgeted >= goal
  });

  // Rent: simple monthly=5833, budgeted=583300, goal=583300, spent=-20000
  it("Rent — funded with some spending shows green with spent portion", () => {
    const cat = makeCat({
      budgeted: 583300,
      spent: -20000,
      balance: 583300 + -20000,
      goal: 583300,
      goalDef: goalDef.monthly(5833),
    });
    const result = computeProgressBar(cat);
    expect(result.pillStatus).toBe("healthy");
    expect(result.barStatus).toBe("healthy");
    expect(result.spent).toBeCloseTo(20000 / 583300);
    expect(result.available).toBeCloseTo((20000 + 563300) / 583300);
  });

  // House decor: simple monthly=200, budgeted=345908, spent=-362281, balance=-16373
  it("House decor — heavily overspent shows red", () => {
    const cat = makeCat({
      budgeted: 345908,
      spent: -362281,
      balance: -16373,
      goal: 20000,
      goalDef: goalDef.monthly(200),
    });
    const result = computeProgressBar(cat);
    expect(result.overspent).toBe(true);
    expect(result.barStatus).toBe("overspent");
    expect(result.pillStatus).toBe("overspent");
  });

  // Fines & Penalties: simple monthly=200 + limit up to 800
  // budgeted=20000, goal=20000, spent=0, balance=20000
  it("Fines — monthly with limit, funded, no spending → green full bar", () => {
    const cat = makeCat({
      budgeted: 20000,
      spent: 0,
      balance: 20000,
      goal: 20000,
      longGoal: false,
      goalDef: JSON.stringify([
        {
          type: "simple",
          monthly: 200,
          limit: { amount: 800, hold: null, period: "monthly", start: null },
          priority: 0,
          directive: "template",
        },
      ]),
    });
    const result = computeProgressBar(cat);
    expect(result.pillStatus).toBe("healthy");
    expect(result.barStatus).toBe("healthy");
    expect(result.available).toBe(1);
  });

  // No goal, no template (HSBC Max Rewards, Cripto)
  it("no goal, no template, zero balance → empty neutral", () => {
    const cat = makeCat({ budgeted: 0, spent: 0, balance: 0 });
    const result = computeProgressBar(cat);
    expect(result).toEqual({
      spent: 0,
      available: 0,
      overspent: false,
      striped: true,
      barStatus: "neutral",
      pillStatus: "neutral",
    });
  });

  // UAE Documents: budgeted=-86363, no goal → no goal with negative budget
  it("negative budget, no goal → shows based on balance", () => {
    const cat = makeCat({
      budgeted: -86363,
      spent: 0,
      balance: -86363 + 614000,
      carryIn: 614000,
    });
    const result = computeProgressBar(cat);
    expect(result.pillStatus).toBe("healthy"); // positive balance
  });
});
