import { afterEach, describe, expect, it } from "vitest";
import { openTestDb, closeTestDb } from "@/core/db/__tests__/testDb";
import { createAccount } from "@/core/server/accounts";
import { createRule } from "@/core/domain/rules";
import { runQuery } from "@/core/db";
import { reconcileAccount } from "./index";

describe("reconcileAccount", () => {
  afterEach(async () => {
    await closeTestDb();
  });

  it("runs rules over the reconciliation adjustment (upstream parity)", async () => {
    await openTestDb();
    const acct = await createAccount({ name: "Checking" });
    // A rule that rewrites the notes of any transaction on this account.
    await createRule({
      conditions: [{ field: "account", op: "is", value: acct }],
      actions: [{ op: "set", field: "notes", value: "RULED" }],
    });

    // No cleared transactions → cleared balance 0 → diff = 5000 → adjustment.
    const res = await reconcileAccount(acct, 5000);
    expect(res).toEqual({ adjusted: true, diff: 5000 });

    const rows = await runQuery<{
      amount: number;
      cleared: number;
      notes: string | null;
    }>("SELECT amount, cleared, notes FROM transactions WHERE acct = ? AND tombstone = 0", [acct]);
    expect(rows).toHaveLength(1);
    expect(rows[0].amount).toBe(5000);
    expect(rows[0].cleared).toBe(1);
    // If rules were skipped, notes would stay "Reconciliation balance adjustment".
    expect(rows[0].notes).toBe("RULED");
  });

  it("locks without an adjustment when the balance already matches", async () => {
    await openTestDb();
    const acct = await createAccount({ name: "Checking" });
    const res = await reconcileAccount(acct, 0);
    expect(res).toEqual({ adjusted: false, diff: 0 });
    const rows = await runQuery("SELECT id FROM transactions WHERE acct = ? AND tombstone = 0", [
      acct,
    ]);
    expect(rows).toHaveLength(0);
  });
});
