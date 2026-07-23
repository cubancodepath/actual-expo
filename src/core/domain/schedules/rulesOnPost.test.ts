import { describe, it, expect, afterEach } from "vitest";
import { openTestDb, closeTestDb } from "@/core/db/__tests__/testDb";
import { createCategoryGroup, createCategory } from "@/core/domain/categories";
import { createAccount } from "@/core/server/accounts";
import { addTransaction } from "@/core/domain/transactions";
import { createRule } from "@/core/domain/rules";
import { createSchedule, postTransactionForScheduleToday } from "@/core/domain/schedules";
import { runQuery } from "@/core/db";

describe("schedule-posted transactions run the general rule set (fix #16 / Phase 3.3)", () => {
  afterEach(async () => {
    await closeTestDb();
  });

  it("applies a category-setting rule to a schedule-posted transaction, overriding the schedule's own category", async () => {
    await openTestDb();
    const group = await createCategoryGroup({ name: "Bills" });
    const scheduleCat = await createCategory({ name: "Misc", cat_group: group });
    const ruleCat = await createCategory({ name: "Rent", cat_group: group });
    const acct = await createAccount({ name: "Checking" });

    // A general rule: any transaction on this account gets categorized as Rent.
    await createRule({
      conditions: [{ field: "account", op: "is", value: acct }],
      actions: [{ op: "set", field: "category", value: ruleCat }],
    });

    const scheduleId = await createSchedule({
      schedule: { name: "Rent Schedule" },
      conditions: [
        { field: "date", op: "is", value: "2020-01-15" },
        { field: "account", op: "is", value: acct },
        { field: "amount", op: "is", value: -120000 },
      ],
      actions: [{ op: "set", field: "category", value: scheduleCat }],
    });

    await postTransactionForScheduleToday(scheduleId);

    const rows = await runQuery<{ category: string; amount: number }>(
      "SELECT category, amount FROM transactions WHERE schedule = ?",
      [scheduleId],
    );
    expect(rows).toHaveLength(1);
    // The rule ran and overrode the schedule's own category.
    expect(rows[0].category).toBe(ruleCat);
    expect(rows[0].amount).toBe(-120000);
  });

  it("keeps the schedule's own category when no rule matches", async () => {
    await openTestDb();
    const group = await createCategoryGroup({ name: "Bills" });
    const scheduleCat = await createCategory({ name: "Misc", cat_group: group });
    const acct = await createAccount({ name: "Checking" });

    const scheduleId = await createSchedule({
      schedule: { name: "No Rule Schedule" },
      conditions: [
        { field: "date", op: "is", value: "2020-01-15" },
        { field: "account", op: "is", value: acct },
        { field: "amount", op: "is", value: -5000 },
      ],
      actions: [{ op: "set", field: "category", value: scheduleCat }],
    });

    await postTransactionForScheduleToday(scheduleId);

    const rows = await runQuery<{ category: string }>(
      "SELECT category FROM transactions WHERE schedule = ?",
      [scheduleId],
    );
    expect(rows[0].category).toBe(scheduleCat);
  });

  it("materializes a split (parent + children) when a matching rule has set-split-amount actions", async () => {
    await openTestDb();
    const group = await createCategoryGroup({ name: "Bills" });
    const catA = await createCategory({ name: "A", cat_group: group });
    const catB = await createCategory({ name: "B", cat_group: group });
    const acct = await createAccount({ name: "Checking" });

    // A general rule that splits any transaction on this account: 3000 to A,
    // the remainder to B.
    await createRule({
      conditions: [{ field: "account", op: "is", value: acct }],
      actions: [
        {
          op: "set-split-amount",
          value: -3000,
          options: { splitIndex: 1, method: "fixed-amount" },
        },
        { op: "set", field: "category", value: catA, options: { splitIndex: 1 } },
        { op: "set-split-amount", value: 0, options: { splitIndex: 2, method: "remainder" } },
        { op: "set", field: "category", value: catB, options: { splitIndex: 2 } },
      ],
    });

    const scheduleId = await createSchedule({
      schedule: { name: "Split Schedule" },
      conditions: [
        { field: "date", op: "is", value: "2020-01-15" },
        { field: "account", op: "is", value: acct },
        { field: "amount", op: "is", value: -10000 },
      ],
    });

    await postTransactionForScheduleToday(scheduleId);

    const parent = await runQuery<{
      id: string;
      category: string | null;
      amount: number;
      isParent: number;
    }>("SELECT id, category, amount, isParent FROM transactions WHERE schedule = ?", [scheduleId]);
    expect(parent).toHaveLength(1);
    expect(parent[0].isParent).toBe(1);
    expect(parent[0].category).toBeNull();
    expect(parent[0].amount).toBe(-10000);

    const children = await runQuery<{ category: string; amount: number; isChild: number }>(
      "SELECT category, amount, isChild FROM transactions WHERE parent_id = ? ORDER BY amount DESC",
      [parent[0].id],
    );
    expect(children).toHaveLength(2);
    expect(children.every((c) => c.isChild === 1)).toBe(true);
    // A gets the fixed -3000; B absorbs the remainder -7000.
    expect(children).toEqual([
      expect.objectContaining({ category: catA, amount: -3000 }),
      expect.objectContaining({ category: catB, amount: -7000 }),
    ]);
    // Children sum to the parent total.
    expect(children[0].amount + children[1].amount).toBe(-10000);
  });

  it("posts a single row (no split) when the matching rule has no split actions", async () => {
    await openTestDb();
    const group = await createCategoryGroup({ name: "Bills" });
    const cat = await createCategory({ name: "Rent", cat_group: group });
    const acct = await createAccount({ name: "Checking" });

    await createRule({
      conditions: [{ field: "account", op: "is", value: acct }],
      actions: [{ op: "set", field: "category", value: cat }],
    });

    const scheduleId = await createSchedule({
      schedule: { name: "Simple Schedule" },
      conditions: [
        { field: "date", op: "is", value: "2020-01-15" },
        { field: "account", op: "is", value: acct },
        { field: "amount", op: "is", value: -5000 },
      ],
    });

    await postTransactionForScheduleToday(scheduleId);

    const rows = await runQuery<{ isParent: number; isChild: number }>(
      "SELECT isParent, isChild FROM transactions WHERE acct = ?",
      [acct],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].isParent).toBe(0);
    expect(rows[0].isChild).toBe(0);
  });
});

describe("schedule-posted transactions resolve BALANCE_OF in rule formulas (Phase 3d)", () => {
  afterEach(async () => {
    await closeTestDb();
  });

  it("sets the posted amount to the account's running balance via BALANCE_OF", async () => {
    await openTestDb();
    const acct = await createAccount({ name: "Checking" });

    // A prior transaction establishing the running balance.
    await addTransaction({
      account: acct,
      date: 20200101,
      amount: -5000,
      payee: null,
      category: null,
      notes: null,
      cleared: false,
    });

    // Rule: on this account, set the amount to the current balance of Checking.
    await createRule({
      conditions: [{ field: "account", op: "is", value: acct }],
      actions: [
        {
          op: "set",
          field: "amount",
          value: null,
          options: { formula: '=BALANCE_OF("Checking")' },
        },
      ],
    });

    const scheduleId = await createSchedule({
      schedule: { name: "Balance Schedule" },
      conditions: [
        { field: "date", op: "is", value: "2020-06-15" },
        { field: "account", op: "is", value: acct },
        { field: "amount", op: "is", value: -1 },
      ],
    });

    await postTransactionForScheduleToday(scheduleId);

    const rows = await runQuery<{ amount: number }>(
      "SELECT amount FROM transactions WHERE schedule = ?",
      [scheduleId],
    );
    expect(rows).toHaveLength(1);
    // Running balance before the posted row = the single prior -5000 transaction.
    expect(rows[0].amount).toBe(-5000);
  });
});
