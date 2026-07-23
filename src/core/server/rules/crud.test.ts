import { describe, it, expect, afterEach } from "vitest";
import { openTestDb, closeTestDb } from "@/core/db/__tests__/testDb";
import { createAccount } from "@/core/server/accounts";
import { createSchedule } from "@/core/server/schedules";
import { sendMessages } from "@/core/sync";
import { Timestamp } from "@/core/crdt";
import { runQuery, first } from "@/core/db";
import { createRule, deleteRule, getRules } from "./index";
import { RuleError } from "./errors";

describe("rules CRUD hardening (Phase 2.4)", () => {
  afterEach(async () => {
    await closeTestDb();
  });

  it("createRule rejects an invalid condition (unknown field)", async () => {
    await openTestDb();
    await expect(
      createRule({
        conditions: [{ field: "not_a_field", op: "is", value: "x" }],
        actions: [{ op: "set", field: "notes", value: "x" }],
      }),
    ).rejects.toBeInstanceOf(RuleError);
  });

  it("deleteRule tombstones an unlinked rule", async () => {
    await openTestDb();
    const acct = await createAccount({ name: "A" });
    const id = await createRule({
      conditions: [{ field: "account", op: "is", value: acct }],
      actions: [{ op: "set", field: "notes", value: "x" }],
    });
    await deleteRule(id);
    const rows = await runQuery<{ tombstone: number }>("SELECT tombstone FROM rules WHERE id = ?", [
      id,
    ]);
    expect(rows[0].tombstone).toBe(1);
  });

  it("deleteRule refuses to delete a schedule-linked rule unless forced", async () => {
    await openTestDb();
    const acct = await createAccount({ name: "A" });
    const scheduleId = await createSchedule({
      schedule: { name: "S" },
      conditions: [
        { field: "date", op: "is", value: "2020-01-15" },
        { field: "account", op: "is", value: acct },
        { field: "amount", op: "is", value: -5000 },
      ],
    });
    const sched = await first<{ rule: string }>("SELECT rule FROM schedules WHERE id = ?", [
      scheduleId,
    ]);
    const ruleId = sched!.rule;

    await expect(deleteRule(ruleId)).rejects.toBeInstanceOf(RuleError);
    const alive = await first<{ tombstone: number }>("SELECT tombstone FROM rules WHERE id = ?", [
      ruleId,
    ]);
    expect(alive!.tombstone).toBe(0);

    await deleteRule(ruleId, { force: true });
    const dead = await first<{ tombstone: number }>("SELECT tombstone FROM rules WHERE id = ?", [
      ruleId,
    ]);
    expect(dead!.tombstone).toBe(1);
  });

  it("normalizes a legacy stage (cleanup) to 'pre' on load", async () => {
    await openTestDb();
    const acct = await createAccount({ name: "A" });
    const id = await createRule({
      conditions: [{ field: "account", op: "is", value: acct }],
      actions: [{ op: "set", field: "notes", value: "x" }],
    });
    await sendMessages([
      {
        timestamp: Timestamp.send()!,
        dataset: "rules",
        row: id,
        column: "stage",
        value: "cleanup",
      },
    ]);

    const rules = await getRules();
    const loaded = rules.find((r) => r.getId() === id);
    expect(loaded?.stage).toBe("pre");
  });
});
