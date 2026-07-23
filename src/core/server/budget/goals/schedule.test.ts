import { describe, it, expect, afterEach } from "vitest";
import { openTestDb, closeTestDb } from "@/core/db/__tests__/testDb";
import { createCategoryGroup, createCategory } from "@/core/server/budget";
import { createSchedule } from "@/core/server/schedules";
import { calculateGoal } from "@/core/server/budget/category-template-context";
import type { ScheduleTemplate } from "@/core/types/models";
import { currentMonth, addMonths } from "@/core/shared/months";

function scheduleTemplate(
  name: string,
  overrides: Partial<ScheduleTemplate> = {},
): ScheduleTemplate {
  return { type: "schedule", name, priority: 0, directive: "template", ...overrides };
}

describe("goals engine — schedule template (fix #12)", () => {
  afterEach(async () => {
    await closeTestDb();
  });

  it("budgets the full amount this month when the schedule is due this month (pay-month-of)", async () => {
    await openTestDb();
    const group = await createCategoryGroup({ name: "Bills" });
    const cat = await createCategory({ name: "Rent", cat_group: group });
    const month = currentMonth();

    await createSchedule({
      schedule: { name: "Rent" },
      conditions: [
        { field: "date", op: "is", value: `${month}-15` },
        { field: "amount", op: "is", value: -120000 },
      ],
    });

    const result = await calculateGoal(cat, month, [scheduleTemplate("Rent")], {
      fromLastMonth: 0,
      previouslyBudgeted: 0,
    });

    expect(result.budgeted).toBe(120000);
  });

  it("spreads the contribution evenly across months when the schedule is due later (sinking)", async () => {
    await openTestDb();
    const group = await createCategoryGroup({ name: "Bills" });
    const cat = await createCategory({ name: "Insurance", cat_group: group });
    const month = currentMonth();
    const dueMonth = addMonths(month, 3);

    await createSchedule({
      schedule: { name: "Insurance" },
      conditions: [
        { field: "date", op: "is", value: `${dueMonth}-15` },
        { field: "amount", op: "is", value: -60000 },
      ],
    });

    const result = await calculateGoal(cat, month, [scheduleTemplate("Insurance")], {
      fromLastMonth: 0,
      previouslyBudgeted: 0,
    });

    // 3 months out -> spread over 4 months (this month + 3 remaining) = 15000/mo
    expect(result.budgeted).toBe(15000);
  });

  it("applies a percent adjustment to the schedule's target amount", async () => {
    await openTestDb();
    const group = await createCategoryGroup({ name: "Bills" });
    const cat = await createCategory({ name: "Subscription", cat_group: group });
    const month = currentMonth();

    await createSchedule({
      schedule: { name: "Subscription" },
      conditions: [
        { field: "date", op: "is", value: `${month}-15` },
        { field: "amount", op: "is", value: -1000 },
      ],
    });

    const result = await calculateGoal(
      cat,
      month,
      [scheduleTemplate("Subscription", { adjustment: 10, adjustmentType: "percent" })],
      { fromLastMonth: 0, previouslyBudgeted: 0 },
    );

    expect(result.budgeted).toBe(1100); // -1000 * 1.10 -> -1100 -> budget +1100
  });

  it("resolves an income schedule with the opposite sign", async () => {
    await openTestDb();
    const group = await createCategoryGroup({ name: "Income", is_income: true });
    const cat = await createCategory({ name: "Freelance", cat_group: group, is_income: true });
    const month = currentMonth();

    await createSchedule({
      schedule: { name: "Freelance" },
      conditions: [
        { field: "date", op: "is", value: `${month}-15` },
        { field: "amount", op: "is", value: 50000 },
      ],
    });

    const result = await calculateGoal(cat, month, [scheduleTemplate("Freelance")], {
      fromLastMonth: 0,
      previouslyBudgeted: 0,
    });

    expect(result.budgeted).toBe(50000);
  });

  it("returns 0 when the referenced schedule doesn't exist", async () => {
    await openTestDb();
    const group = await createCategoryGroup({ name: "Bills" });
    const cat = await createCategory({ name: "Ghost", cat_group: group });
    const month = currentMonth();

    const result = await calculateGoal(cat, month, [scheduleTemplate("Nonexistent")], {
      fromLastMonth: 0,
      previouslyBudgeted: 0,
    });

    expect(result.budgeted).toBe(0);
  });
});
