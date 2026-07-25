import { describe, it, expect, afterEach } from "vitest";
import { openTestDb, closeTestDb } from "@/core/server/db/__tests__/testDb";
import { createAccount } from "@/core/server/accounts";
import { createSchedule } from "@/core/server/schedules";
import { createPayee } from "@/core/server/payees";
import { createRule, deleteAllRules, validateRule, getRules } from "@/core/server/rules";
import {
  loadRules,
  runRules,
  getRulesForPayee,
  updatePayeeRenameRule,
  getRuleIdFromScheduleId,
  getAllRuleIdsFromSchedules,
} from "@/core/server/transactions/transaction-rules";

describe("in-memory rule store", () => {
  afterEach(async () => {
    await closeTestDb();
  });

  it("loadRules() populates the store; getRules() returns it (in-memory)", async () => {
    await openTestDb();
    const acct = await createAccount({ name: "A" });
    await createRule({
      conditions: [{ field: "account", op: "is", value: acct }],
      actions: [{ op: "set", field: "notes", value: "x" }],
    });
    await loadRules();
    const rules = await getRules();
    expect(rules.length).toBe(1);
  });

  it("onApplySync invalidates the store after a rule write (getRules stays fresh)", async () => {
    await openTestDb();
    const acct = await createAccount({ name: "A" });
    expect((await getRules()).length).toBe(0); // warms the store

    await createRule({
      conditions: [{ field: "account", op: "is", value: acct }],
      actions: [{ op: "set", field: "notes", value: "x" }],
    });

    // The 'applied' event for the rules table invalidated the store, so the
    // next getRules() reloads and reflects the new rule.
    expect((await getRules()).length).toBe(1);
  });

  it("runRules(trans) applies a stored rule and enriches/finalizes", async () => {
    await openTestDb();
    const acct = await createAccount({ name: "A" });
    const payee = await createPayee({ name: "Coffee" });
    await createRule({
      conditions: [{ field: "payee", op: "is", value: payee }],
      actions: [{ op: "set", field: "notes", value: "caffeine" }],
    });

    const result = await runRules({
      id: "t1",
      account: acct,
      payee,
      category: null,
      amount: -500,
      date: "2024-03-15",
      notes: null,
    });

    expect(result.notes).toBe("caffeine");
    // Enrichment fields are stripped by finalizeTransactionForRules.
    expect(result.payee_name).toBeUndefined();
    expect(result._balanceOfPrefetched).toBeUndefined();
  });
});

describe("schedule ↔ rule linkage", () => {
  afterEach(async () => {
    await closeTestDb();
  });

  it("getRuleIdFromScheduleId + getAllRuleIdsFromSchedules", async () => {
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
    const ruleId = await getRuleIdFromScheduleId(scheduleId);
    expect(ruleId).toBeTruthy();

    const all = await getAllRuleIdsFromSchedules("");
    expect(all).toContain(ruleId);
    const excluded = await getAllRuleIdsFromSchedules(ruleId!);
    expect(excluded).not.toContain(ruleId);
  });
});

describe("payee rules surface", () => {
  afterEach(async () => {
    await closeTestDb();
  });

  it("getRulesForPayee returns rules referencing the payee", async () => {
    await openTestDb();
    const payee = await createPayee({ name: "Grocer" });
    await createRule({
      conditions: [{ field: "payee", op: "is", value: payee }],
      actions: [{ op: "set", field: "notes", value: "food" }],
    });
    const rules = await getRulesForPayee(payee!);
    expect(rules.length).toBe(1);
  });

  it("updatePayeeRenameRule creates then merges the pre rename rule", async () => {
    await openTestDb();
    const target = await createPayee({ name: "Canonical" });

    const id1 = await updatePayeeRenameRule(["Old Name"], target!);
    const afterCreate = await getRules();
    const created = afterCreate.find((r) => r.getId() === id1);
    expect(created?.stage).toBe("pre");
    expect(created?.conditions[0].op).toBe("oneOf");
    // String `oneOf` values are lowercased by the Condition parser (upstream parity).
    expect(created?.conditions[0].value).toEqual(["old name"]);

    const id2 = await updatePayeeRenameRule(["Another Name"], target!);
    expect(id2).toBe(id1); // merged into the same rule
    const merged = (await getRules()).find((r) => r.getId() === id1);
    expect(merged?.conditions[0].value).toEqual(
      expect.arrayContaining(["old name", "another name"]),
    );
  });
});

describe("validateRule + deleteAllRules", () => {
  afterEach(async () => {
    await closeTestDb();
  });

  it("validateRule returns null for a valid rule, errors for a bad field", async () => {
    await openTestDb();
    expect(
      validateRule({
        conditions: [{ field: "notes", op: "contains", value: "x" }],
        actions: [{ op: "set", field: "notes", value: "y" }],
      }),
    ).toBeNull();

    const bad = validateRule({
      conditions: [{ field: "not_a_field", op: "is", value: "x" }],
      actions: [{ op: "set", field: "notes", value: "y" }],
    });
    expect(bad).not.toBeNull();
    expect(bad!.conditionErrors[0]).toBeTruthy();
    expect(bad!.actionErrors[0]).toBeNull();
  });

  it("deleteAllRules tombstones every rule", async () => {
    await openTestDb();
    const acct = await createAccount({ name: "A" });
    await createRule({
      conditions: [{ field: "account", op: "is", value: acct }],
      actions: [{ op: "set", field: "notes", value: "x" }],
    });
    await createRule({
      conditions: [{ field: "account", op: "is", value: acct }],
      actions: [{ op: "set", field: "notes", value: "y" }],
    });
    expect((await getRules()).length).toBe(2);

    await deleteAllRules();
    expect((await getRules()).length).toBe(0);
  });
});
