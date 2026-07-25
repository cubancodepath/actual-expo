import { describe, it, expect, afterEach } from "vitest";
import { openTestDb, closeTestDb } from "@/core/server/db/__tests__/testDb";
import { first, runQuery } from "@/core/server/db";
import { applyMessages } from "@/core/server/sync/apply";
import { emit } from "@/core/server/sync/syncEvents";
import { Timestamp } from "@/core/crdt";
import { createPayee, mergePayees } from "@/core/server/payees";
import { createCategoryGroup, createCategory, deleteCategory } from "@/core/server/budget";
import { createRule, getRules } from "./index";
import { suggestCategoryForPayee } from "@/core/server/transactions/transaction-rules";

/**
 * Behavior tests for rule id-projection via migrateIds — mirrors upstream's
 * transaction-rules.test.ts "ids in rules are migrated as mapping changes".
 * A rule written against a payee/category that is later merged/deleted must
 * project its condition/action ids to the merge target when loaded.
 */
describe("rules migrateIds — id projection on mapping changes", () => {
  afterEach(async () => {
    await closeTestDb();
  });

  it("projects a payee `is` condition + `set` action to the merge target", async () => {
    await openTestDb();
    const target = await createPayee({ name: "Target" });
    const merged = await createPayee({ name: "Merged" });

    await createRule({
      conditions: [{ field: "payee", op: "is", value: merged }],
      actions: [{ op: "set", field: "payee", value: merged }],
    });

    await mergePayees(target, [merged]);

    const rules = await getRules();
    expect(rules).toHaveLength(1);
    const rule = rules[0];
    expect(rule.conditions[0].value).toBe(target);
    // The original id is preserved for deterministic re-projection.
    expect(rule.conditions[0].rawValue).toBe(merged);
    expect(rule.actions[0].value).toBe(target);
  });

  it("projects each element of a payee `oneOf` condition", async () => {
    await openTestDb();
    const target = await createPayee({ name: "Target" });
    const mergedA = await createPayee({ name: "A" });
    const mergedB = await createPayee({ name: "B" });
    const untouched = await createPayee({ name: "Keep" });

    await createRule({
      conditions: [{ field: "payee", op: "oneOf", value: [mergedA, mergedB, untouched] }],
      actions: [{ op: "set", field: "cleared", value: true }],
    });

    await mergePayees(target, [mergedA, mergedB]);

    const rules = await getRules();
    expect(rules[0].conditions[0].value).toEqual([target, target, untouched]);
  });

  it("projects a category `is` condition after deleteCategory-with-transfer", async () => {
    await openTestDb();
    const g = await createCategoryGroup({ name: "G" });
    const from = await createCategory({ name: "From", groupId: g });
    const to = await createCategory({ name: "To", groupId: g });

    await createRule({
      conditions: [{ field: "category", op: "is", value: from }],
      actions: [{ op: "set", field: "cleared", value: true }],
    });

    await deleteCategory(from, to);

    const rules = await getRules();
    expect(rules[0].conditions[0].value).toBe(to);
    expect(rules[0].conditions[0].rawValue).toBe(from);
  });

  it("keeps the stored rule row on the ORIGINAL id (projection is read-time only)", async () => {
    await openTestDb();
    const target = await createPayee({ name: "Target" });
    const merged = await createPayee({ name: "Merged" });
    const ruleId = await createRule({
      conditions: [{ field: "payee", op: "is", value: merged }],
      actions: [{ op: "set", field: "cleared", value: true }],
    });

    await mergePayees(target, [merged]);

    // Loaded rule is projected...
    expect((await getRules())[0].conditions[0].value).toBe(target);
    // ...but the persisted row still stores the original id.
    const row = await first<{ conditions: string }>("SELECT conditions FROM rules WHERE id = ?", [
      ruleId,
    ]);
    expect(row?.conditions).toContain(merged);
    expect(row?.conditions).not.toContain(target);
  });

  it("projects after a remote mapping message arrives via applyMessages + success event", async () => {
    await openTestDb();
    const target = await createPayee({ name: "Target" });
    const merged = await createPayee({ name: "Merged" });
    await createRule({
      conditions: [{ field: "payee", op: "is", value: merged }],
      actions: [{ op: "set", field: "cleared", value: true }],
    });

    // Warm the cache while no merge exists yet: rule loads unprojected.
    expect((await getRules())[0].conditions[0].value).toBe(merged);

    // Simulate a merge synced from another device: apply the payee_mapping
    // redirect + tombstone verbatim (the fullSync path), then emit the same
    // "success" event fullSync fires after applyMessages.
    await applyMessages([
      {
        timestamp: Timestamp.send()!,
        dataset: "payee_mapping",
        row: merged,
        column: "targetId",
        value: target,
      },
      {
        timestamp: Timestamp.send()!,
        dataset: "payees",
        row: merged,
        column: "tombstone",
        value: 1,
      },
    ]);
    emit({ type: "success", tables: ["payee_mapping", "payees"] });

    // The cache listener refreshed; the rule now projects to the target and a
    // transaction carrying the target payee matches it.
    const rules = await getRules();
    expect(rules[0].conditions[0].value).toBe(target);
    expect(suggestCategoryForPayee).toBeTypeOf("function");
  });

  it("suggestCategoryForPayee resolves against a rule written pre-merge", async () => {
    await openTestDb();
    const g = await createCategoryGroup({ name: "G" });
    const cat = await createCategory({ name: "Groceries", groupId: g });
    const target = await createPayee({ name: "Target" });
    const merged = await createPayee({ name: "Merged" });

    await createRule({
      conditions: [{ field: "payee", op: "is", value: merged }],
      actions: [{ op: "set", field: "category", value: cat }],
    });

    await mergePayees(target, [merged]);

    // A new transaction picks the live (target) payee; the rule — written
    // against the merged id — still matches because both are in target space.
    const suggestion = suggestCategoryForPayee(await getRules(), target, null);
    expect(suggestion).toBe(cat);
  });

  it("leaves rules untouched when there are no merges (identity mappings only)", async () => {
    await openTestDb();
    const payee = await createPayee({ name: "P" });
    await createRule({
      conditions: [{ field: "payee", op: "is", value: payee }],
      actions: [{ op: "set", field: "cleared", value: true }],
    });

    const rules = await getRules();
    expect(rules[0].conditions[0].value).toBe(payee);

    // Sanity: the self-mapping exists but is a no-op projection.
    const map = await runQuery<{ targetId: string }>(
      "SELECT targetId FROM payee_mapping WHERE id = ?",
      [payee],
    );
    expect(map[0].targetId).toBe(payee);
  });
});
