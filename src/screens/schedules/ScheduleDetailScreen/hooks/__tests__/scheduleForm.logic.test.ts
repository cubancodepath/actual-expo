import { describe, it, expect } from "vitest";
import type { Account } from "@/core/types/models";
import type { Category } from "@/core/types/models";
import type { Payee } from "@/core/types/models";
import type { RecurConfig, Schedule } from "@/core/types/models";
import { todayStr } from "@/lib/date";
import {
  buildScheduleSaveRule,
  makeScheduleFormBaseline,
  scheduleToFormValues,
} from "../scheduleForm.logic";
import type { ScheduleFormValues } from "../useScheduleForm";

const account: Account = {
  id: "acc-1",
  name: "Checking",
  offbudget: false,
  closed: false,
  sort_order: null,
  last_reconciled: null,
  tombstone: false,
};
const category: Category = {
  id: "cat-1",
  name: "Rent",
  is_income: false,
  cat_group: "group-1",
  sort_order: null,
  hidden: false,
  goal_def: null,
  tombstone: false,
};
const payee: Payee = {
  id: "payee-1",
  name: "Landlord",
  transfer_acct: null,
  favorite: false,
  tombstone: false,
};

const refData = { accounts: [account], categories: [category], payees: [payee] };

const baseSchedule: Schedule = {
  id: "sched-1",
  name: "Rent",
  rule: "",
  completed: false,
  posts_transaction: false,
  tombstone: false,
  custom_upcoming_length: null,
  next_date: null,
  _payee: null,
  _account: null,
  _amount: null,
  _amountOp: null,
  _date: null,
  _category: null,
  _conditions: [],
};

const recur: RecurConfig = { frequency: "monthly", start: "2026-01-01" };

describe("makeScheduleFormBaseline", () => {
  it("returns a blank, expense-typed, non-recurring baseline", () => {
    const baseline = makeScheduleFormBaseline();
    expect(baseline).toEqual({
      type: "expense",
      amountOp: "is",
      amount: 0,
      amountUpper: 0,
      name: "",
      accountId: null,
      accountName: "",
      payeeId: null,
      payeeName: "",
      categoryId: null,
      categoryName: "",
      recurConfig: null,
      oneTimeDate: null,
      postsTransaction: false,
    });
  });
});

describe("scheduleToFormValues", () => {
  it("maps a simple one-time expense schedule with a negative amount", () => {
    const s: Schedule = {
      ...baseSchedule,
      name: "Rent",
      _account: "acc-1",
      _payee: "payee-1",
      _category: "cat-1",
      _amount: -1500,
      _amountOp: "is",
      _date: "2026-08-01",
    };
    const values = scheduleToFormValues(s, refData);
    expect(values.type).toBe("expense");
    expect(values.amountOp).toBe("is");
    expect(values.amount).toBe(1500);
    expect(values.amountUpper).toBe(0);
    expect(values.accountId).toBe("acc-1");
    expect(values.accountName).toBe("Checking");
    expect(values.payeeId).toBe("payee-1");
    expect(values.payeeName).toBe("Landlord");
    expect(values.categoryId).toBe("cat-1");
    expect(values.categoryName).toBe("Rent");
    expect(values.recurConfig).toBeNull();
    expect(values.oneTimeDate).toBe("2026-08-01");
    expect(values.postsTransaction).toBe(false);
  });

  it("maps a positive amount to income", () => {
    const s: Schedule = { ...baseSchedule, _amount: 2000, _amountOp: "is", _date: "2026-08-01" };
    const values = scheduleToFormValues(s, refData);
    expect(values.type).toBe("income");
    expect(values.amount).toBe(2000);
  });

  it("maps a range amount (isbetween) to unsigned num1/num2 and infers expense from a negative bound", () => {
    const s: Schedule = {
      ...baseSchedule,
      _amount: { num1: -1000, num2: -2000 },
      _amountOp: "isbetween",
      _date: "2026-08-01",
    };
    const values = scheduleToFormValues(s, refData);
    expect(values.type).toBe("expense");
    expect(values.amountOp).toBe("isbetween");
    expect(values.amount).toBe(1000);
    expect(values.amountUpper).toBe(2000);
  });

  it("maps a recurring _date into recurConfig and leaves oneTimeDate null", () => {
    const s: Schedule = { ...baseSchedule, _date: recur };
    const values = scheduleToFormValues(s, refData);
    expect(values.recurConfig).toEqual(recur);
    expect(values.oneTimeDate).toBeNull();
  });

  it("falls back to empty display names when the referenced account/payee/category is unknown", () => {
    const s: Schedule = {
      ...baseSchedule,
      _account: "ghost-account",
      _payee: "ghost-payee",
      _category: "ghost-category",
    };
    const values = scheduleToFormValues(s, refData);
    expect(values.accountId).toBe("ghost-account");
    expect(values.accountName).toBe("");
    expect(values.payeeId).toBe("ghost-payee");
    expect(values.payeeName).toBe("");
    expect(values.categoryId).toBe("ghost-category");
    expect(values.categoryName).toBe("");
  });

  it("defaults name to empty string when the schedule has no name", () => {
    const s: Schedule = { ...baseSchedule, name: null };
    const values = scheduleToFormValues(s, refData);
    expect(values.name).toBe("");
  });
});

describe("buildScheduleSaveRule", () => {
  function values(overrides: Partial<ScheduleFormValues> = {}): ScheduleFormValues {
    return { ...makeScheduleFormBaseline(), accountId: "acc-1", ...overrides };
  }

  it("signs a single amount negative for an expense schedule", () => {
    const { conditions } = buildScheduleSaveRule(values({ type: "expense", amount: 500 }));
    const amountCond = conditions.find((c) => c.field === "amount");
    expect(amountCond).toEqual({ field: "amount", op: "is", value: -500 });
  });

  it("signs a single amount positive for an income schedule", () => {
    const { conditions } = buildScheduleSaveRule(values({ type: "income", amount: 500 }));
    const amountCond = conditions.find((c) => c.field === "amount");
    expect(amountCond).toEqual({ field: "amount", op: "is", value: 500 });
  });

  it("builds a signed range for isbetween", () => {
    const { conditions } = buildScheduleSaveRule(
      values({ type: "expense", amountOp: "isbetween", amount: 100, amountUpper: 200 }),
    );
    const amountCond = conditions.find((c) => c.field === "amount");
    expect(amountCond).toEqual({
      field: "amount",
      op: "isbetween",
      value: { num1: -100, num2: -200 },
    });
  });

  it("adds a payee condition only when payeeId is set", () => {
    const withPayee = buildScheduleSaveRule(values({ payeeId: "payee-1" }));
    expect(withPayee.conditions.some((c) => c.field === "payee")).toBe(true);

    const withoutPayee = buildScheduleSaveRule(values({ payeeId: null }));
    expect(withoutPayee.conditions.some((c) => c.field === "payee")).toBe(false);
  });

  it("always includes an account condition", () => {
    const { conditions } = buildScheduleSaveRule(values({ accountId: "acc-1" }));
    expect(conditions).toContainEqual({ field: "account", op: "is", value: "acc-1" });
  });

  it("uses an approximate-date condition when recurConfig is set", () => {
    const { conditions } = buildScheduleSaveRule(values({ recurConfig: recur }));
    expect(conditions).toContainEqual({ field: "date", op: "isapprox", value: recur });
    expect(conditions.some((c) => c.field === "date" && c.op === "is")).toBe(false);
  });

  it("uses the given one-time date when not recurring", () => {
    const { conditions } = buildScheduleSaveRule(
      values({ recurConfig: null, oneTimeDate: "2026-09-01" }),
    );
    expect(conditions).toContainEqual({ field: "date", op: "is", value: "2026-09-01" });
  });

  it("defaults the one-time date to today when neither recurConfig nor oneTimeDate is set", () => {
    const { conditions } = buildScheduleSaveRule(values({ recurConfig: null, oneTimeDate: null }));
    expect(conditions).toContainEqual({ field: "date", op: "is", value: todayStr() });
  });

  it("emits a set-category action only when categoryId is set", () => {
    const withCategory = buildScheduleSaveRule(values({ categoryId: "cat-1" }));
    expect(withCategory.actions).toEqual([{ op: "set", field: "category", value: "cat-1" }]);

    const withoutCategory = buildScheduleSaveRule(values({ categoryId: null }));
    expect(withoutCategory.actions).toEqual([]);
  });
});

describe("round-trip: hydrate then save reproduces the same rule shape", () => {
  it("a no-op edit on a hydrated schedule rebuilds an equivalent condition set", () => {
    const s: Schedule = {
      ...baseSchedule,
      _account: "acc-1",
      _payee: "payee-1",
      _category: "cat-1",
      _amount: -1500,
      _amountOp: "is",
      _date: "2026-08-01",
    };
    const values = scheduleToFormValues(s, refData);
    const { conditions, actions } = buildScheduleSaveRule(values);
    expect(conditions).toContainEqual({ field: "account", op: "is", value: "acc-1" });
    expect(conditions).toContainEqual({ field: "payee", op: "is", value: "payee-1" });
    expect(conditions).toContainEqual({ field: "amount", op: "is", value: -1500 });
    expect(conditions).toContainEqual({ field: "date", op: "is", value: "2026-08-01" });
    expect(actions).toEqual([{ op: "set", field: "category", value: "cat-1" }]);
  });
});
