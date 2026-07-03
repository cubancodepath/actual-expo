import { describe, it, expect, afterEach } from "vitest";
import { openTestDb, closeTestDb } from "@/core/db/__tests__/testDb";
import { createCategoryGroup, createCategory } from "@/core/domain/categories";
import { createAccount } from "@/core/domain/accounts";
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
});
