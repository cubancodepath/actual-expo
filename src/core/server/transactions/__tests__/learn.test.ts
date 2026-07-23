import { describe, it, expect, afterEach } from "vitest";
import { openTestDb, closeTestDb } from "@/core/db/__tests__/testDb";
import { createAccount } from "@/core/server/accounts";
import { createCategoryGroup, createCategory } from "@/core/domain/categories";
import { findOrCreatePayee, createPayee, mergePayees } from "@/core/server/payees";
import { addTransaction } from "@/core/server/transactions";
import { getRules, createRule } from "@/core/server/rules";
import {
  updateCategoryRules,
  getProbableCategory,
  type LearnTransaction,
} from "../transaction-rules";

const t = (id: string, category: string | null): LearnTransaction => ({
  id,
  payee: "p",
  category,
  date: 20240101,
});

describe("getProbableCategory", () => {
  it("returns the dominant category when it appears at least 3 times", () => {
    expect(getProbableCategory([t("1", "c1"), t("2", "c1"), t("3", "c1"), t("4", "c2")])).toBe(
      "c1",
    );
  });

  it("returns null below the 3-occurrence threshold", () => {
    expect(getProbableCategory([t("1", "c1"), t("2", "c1"), t("3", "c2")])).toBeNull();
  });

  it("ignores uncategorized transactions", () => {
    expect(getProbableCategory([t("1", null), t("2", null)])).toBeNull();
  });
});

describe("updateCategoryRules (category learning)", () => {
  afterEach(async () => {
    await closeTestDb();
  });

  async function seed() {
    const acct = await createAccount({ name: "A" });
    const group = await createCategoryGroup({ name: "G" });
    const cat = await createCategory({ name: "Groceries", cat_group: group });
    const payee = await findOrCreatePayee("Store");
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      ids.push(
        await addTransaction({
          account: acct,
          date: 20240101 + i,
          amount: -100,
          payee,
          category: cat,
          notes: null,
          cleared: false,
        }),
      );
    }
    return { payee, cat, ids };
  }

  it("creates a payee→category rule after 3 same-category transactions", async () => {
    await openTestDb();
    const { payee, cat, ids } = await seed();

    await updateCategoryRules([{ id: ids[0], payee, category: cat, date: 20240101 }]);

    const rules = await getRules();
    const learned = rules.find(
      (r) => r.conditions[0]?.field === "payee" && r.conditions[0]?.value === payee,
    );
    expect(learned).toBeDefined();
    expect(learned!.actions[0].field).toBe("category");
    expect(learned!.actions[0].value).toBe(cat);
  });

  it("updates an existing payee-setter rule to the newly-learned category", async () => {
    await openTestDb();
    const { payee, cat, ids } = await seed();
    const group = await createCategoryGroup({ name: "G2" });
    const oldCat = await createCategory({ name: "Old", cat_group: group });

    await createRule({
      conditions: [{ field: "payee", op: "is", value: payee }],
      actions: [{ op: "set", field: "category", value: oldCat }],
    });

    await updateCategoryRules([{ id: ids[0], payee, category: cat, date: 20240101 }]);

    const rules = await getRules();
    const setters = rules.filter(
      (r) => r.conditions[0]?.field === "payee" && r.conditions[0]?.value === payee,
    );
    // The existing rule was updated in place (no duplicate created).
    expect(setters).toHaveLength(1);
    expect(setters[0].actions[0].value).toBe(cat);
  });

  it("counts a merged payee's history under the target and learns a target-id rule", async () => {
    await openTestDb();
    const acct = await createAccount({ name: "A" });
    const group = await createCategoryGroup({ name: "G" });
    const cat = await createCategory({ name: "Groceries", cat_group: group });
    const target = await createPayee({ name: "Target" });
    const merged = await createPayee({ name: "Merged" });

    // Three transactions recorded against the payee BEFORE it is merged away —
    // their description stays `merged` (raw), resolved to `target` at read time.
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      ids.push(
        await addTransaction({
          account: acct,
          date: 20240101 + i,
          amount: -100,
          payee: merged,
          category: cat,
          notes: null,
          cleared: false,
        }),
      );
    }

    await mergePayees(target, [merged]);

    // Learning is driven by the live (target) payee id, as it would be from a
    // form edit after the merge; the edited txn is one of the payee's latest.
    await updateCategoryRules([{ id: ids[0], payee: target, category: cat, date: 20240101 }]);

    const rules = await getRules();
    const learned = rules.find(
      (r) => r.conditions[0]?.field === "payee" && r.conditions[0]?.value === target,
    );
    expect(learned).toBeDefined();
    expect(learned!.actions[0].value).toBe(cat);
  });

  it("does not create a rule below the 3-occurrence threshold", async () => {
    await openTestDb();
    const acct = await createAccount({ name: "A" });
    const group = await createCategoryGroup({ name: "G" });
    const cat = await createCategory({ name: "Groceries", cat_group: group });
    const payee = await findOrCreatePayee("Store");
    const ids: string[] = [];
    for (let i = 0; i < 2; i++) {
      ids.push(
        await addTransaction({
          account: acct,
          date: 20240101 + i,
          amount: -100,
          payee,
          category: cat,
          notes: null,
          cleared: false,
        }),
      );
    }

    await updateCategoryRules([{ id: ids[0], payee, category: cat, date: 20240101 }]);

    const rules = await getRules();
    const learned = rules.find((r) => r.conditions[0]?.field === "payee");
    expect(learned).toBeUndefined();
  });
});
