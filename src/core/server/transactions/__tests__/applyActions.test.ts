import { describe, it, expect, afterEach } from "vitest";
import { openTestDb, closeTestDb } from "@/core/db/__tests__/testDb";
import { createAccount } from "@/core/server/accounts";
import { createCategory } from "@/core/server/budget";
import { createPayee } from "@/core/server/payees";
import { runQuery, first } from "@/core/db";
import { addTransaction, batchUpdateTransactions } from "@/core/server/transactions";
import { applyActions } from "@/core/server/transactions/transaction-rules";
import { ruleModel, serializeConditionsOrActions } from "@/core/server/rules";

type Row = {
  id: string;
  category: string | null;
  notes: string | null;
  tombstone: number;
  amount: number;
};

describe("batchUpdateTransactions", () => {
  afterEach(async () => {
    await closeTestDb();
  });

  it("adds, updates and deletes rows in one batch", async () => {
    await openTestDb();
    const acct = await createAccount({ name: "A" });

    const t1 = await addTransaction({ account: acct, date: 20240101, amount: -100 });
    const t2 = await addTransaction({ account: acct, date: 20240102, amount: -200 });

    const res = await batchUpdateTransactions({
      added: [{ account: acct, date: 20240103, amount: -300, notes: "new" }],
      updated: [{ id: t1, notes: "changed" }],
      deleted: [{ id: t2 }],
    });

    expect(res.added.length).toBe(1);
    const addedId = res.added[0].id;

    const added = await first<Row>("SELECT * FROM transactions WHERE id = ?", [addedId]);
    expect(added?.notes).toBe("new");
    const updated = await first<Row>("SELECT * FROM transactions WHERE id = ?", [t1]);
    expect(updated?.notes).toBe("changed");
    const deleted = await first<Row>("SELECT * FROM transactions WHERE id = ?", [t2]);
    expect(deleted?.tombstone).toBe(1);
  });
});

describe("applyActions", () => {
  afterEach(async () => {
    await closeTestDb();
  });

  it("sets a field on existing transactions and persists it", async () => {
    await openTestDb();
    const acct = await createAccount({ name: "A" });
    const payee = await createPayee({ name: "P" });
    const cat = await createCategory({ name: "Food", group: "g" });

    const t1 = await addTransaction({ account: acct, date: 20240101, amount: -100, payee });
    const t2 = await addTransaction({ account: acct, date: 20240102, amount: -200, payee });

    const result = await applyActions(
      [
        {
          id: t1,
          account: acct,
          payee,
          category: null,
          amount: -100,
          date: "2024-01-01",
          notes: null,
        },
        {
          id: t2,
          account: acct,
          payee,
          category: null,
          amount: -200,
          date: "2024-01-02",
          notes: null,
        },
      ],
      [{ op: "set", field: "category", value: cat }],
    );

    expect(result).not.toBeNull();
    const rows = await runQuery<Row>("SELECT * FROM transactions WHERE id IN (?, ?)", [t1, t2]);
    expect(rows.every((r) => r.category === cat)).toBe(true);
  });

  it("append-notes appends to the existing notes", async () => {
    await openTestDb();
    const acct = await createAccount({ name: "A" });
    const t1 = await addTransaction({ account: acct, date: 20240101, amount: -100, notes: "hi" });

    await applyActions(
      [
        {
          id: t1,
          account: acct,
          payee: null,
          category: null,
          amount: -100,
          date: "2024-01-01",
          notes: "hi",
        },
      ],
      [{ op: "append-notes", value: " there" }],
    );

    const row = await first<Row>("SELECT * FROM transactions WHERE id = ?", [t1]);
    expect(row?.notes).toBe("hi there");
  });

  it("returns null when an action fails to parse", async () => {
    await openTestDb();
    const acct = await createAccount({ name: "A" });
    const t1 = await addTransaction({ account: acct, date: 20240101, amount: -100 });

    const result = await applyActions(
      [
        {
          id: t1,
          account: acct,
          payee: null,
          category: null,
          amount: -100,
          date: "2024-01-01",
          notes: null,
        },
      ],
      [{ op: "set", field: "not_a_field", value: "x" }],
    );
    expect(result).toBeNull();
  });
});

describe("ruleModel + serializeConditionsOrActions", () => {
  it("serializes public field names to internal DB names", () => {
    const json = serializeConditionsOrActions([{ field: "payee", op: "is", value: "p1" }]);
    const parsed = JSON.parse(json);
    expect(parsed[0].field).toBe("description"); // payee → description
  });

  it("fromJS → toJS round-trips conditions/actions with field renaming", () => {
    const row = ruleModel.fromJS({
      stage: "pre",
      conditionsOp: "and",
      conditions: [{ field: "payee", op: "is", value: "p1" }],
      actions: [{ op: "set", field: "category", value: "c1" }],
    });
    // Stored form uses internal names + conditions_op.
    expect(row.conditions_op).toBe("and");
    expect(JSON.parse(row.conditions as string)[0].field).toBe("description");

    const js = ruleModel.toJS(row);
    expect(js.conditionsOp).toBe("and");
    expect((js.conditions as Array<{ field: string }>)[0].field).toBe("payee");
    expect((js.actions as Array<{ field: string }>)[0].field).toBe("category");
  });

  it("validate rejects a bad stage/conditionsOp", () => {
    expect(() =>
      ruleModel.validate({ stage: "bogus", conditionsOp: "and", conditions: [], actions: [] }),
    ).toThrow();
    expect(() =>
      ruleModel.validate({ stage: "pre", conditionsOp: "xor", conditions: [], actions: [] }),
    ).toThrow();
    expect(
      ruleModel.validate({ stage: "pre", conditionsOp: "and", conditions: [], actions: [] }),
    ).toBeTruthy();
  });
});
