import { describe, it, expect } from "vitest";
import { Action } from "@/core/server/rules/action";
import { Rule } from "@/core/server/rules/rule";
import { execActions as execActionsWithSplits } from "@/core/server/rules/rule";
import { applyRankedRules as runRulesWithSplits } from "../transaction-rules";

describe("execActionsWithSplits", () => {
  it("returns the plain transaction when there are no split actions", () => {
    const actions = [new Action("set", "category", "cat-a", undefined)];
    const result = execActionsWithSplits(actions, {
      id: "t1",
      amount: -10000,
      category: null,
    });
    expect(result.category).toBe("cat-a");
    expect(result.subtransactions).toBeUndefined();
  });

  it("splits a fixed-amount child and distributes the remainder", () => {
    const actions = [
      new Action("set-split-amount", null, -3000, { splitIndex: 1, method: "fixed-amount" }),
      new Action("set", "category", "cat-a", { splitIndex: 1 }),
      new Action("set-split-amount", null, 0, { splitIndex: 2, method: "remainder" }),
      new Action("set", "category", "cat-b", { splitIndex: 2 }),
    ];

    const result = execActionsWithSplits(actions, {
      id: "t1",
      account: "a1",
      payee: "p1",
      category: null,
      amount: -10000,
      date: "2026-03-09",
    });

    const subs = result.subtransactions as Array<{ amount: number; category: string }>;
    expect(subs).toHaveLength(2);
    expect(subs[0]).toMatchObject({ amount: -3000, category: "cat-a" });
    expect(subs[1]).toMatchObject({ amount: -7000, category: "cat-b" });
    // children sum to the parent amount
    expect(subs[0].amount + subs[1].amount).toBe(-10000);
  });

  it("distributes fixed-percent of the remaining amount", () => {
    const actions = [
      new Action("set-split-amount", null, 25, { splitIndex: 1, method: "fixed-percent" }),
      new Action("set", "category", "cat-a", { splitIndex: 1 }),
      new Action("set-split-amount", null, 0, { splitIndex: 2, method: "remainder" }),
      new Action("set", "category", "cat-b", { splitIndex: 2 }),
    ];

    const result = execActionsWithSplits(actions, { id: "t1", category: null, amount: -8000 });
    const subs = result.subtransactions as Array<{ amount: number }>;
    // 25% of 8000 = 2000, remainder 6000
    expect(subs[0].amount).toBe(-2000);
    expect(subs[1].amount).toBe(-6000);
  });
});

describe("runRulesWithSplits", () => {
  it("applies a matching rule's split actions to produce subtransactions", () => {
    const rule = new Rule({
      conditionsOp: "and",
      conditions: [{ op: "is", field: "payee", value: "p1" }],
      actions: [
        {
          op: "set-split-amount",
          value: -3000,
          options: { splitIndex: 1, method: "fixed-amount" },
        },
        { op: "set", field: "category", value: "cat-a", options: { splitIndex: 1 } },
        { op: "set-split-amount", value: 0, options: { splitIndex: 2, method: "remainder" } },
        { op: "set", field: "category", value: "cat-b", options: { splitIndex: 2 } },
      ],
    });

    const result = runRulesWithSplits([rule], {
      id: "t1",
      payee: "p1",
      category: null,
      amount: -10000,
    });

    expect(result.subtransactions).toHaveLength(2);
  });

  it("leaves a non-matching rule's transaction untouched", () => {
    const rule = new Rule({
      conditionsOp: "and",
      conditions: [{ op: "is", field: "payee", value: "other" }],
      actions: [
        {
          op: "set-split-amount",
          value: -3000,
          options: { splitIndex: 1, method: "fixed-amount" },
        },
      ],
    });

    const result = runRulesWithSplits([rule], { id: "t1", payee: "p1", amount: -10000 });
    expect(result.subtransactions).toBeUndefined();
  });
});
