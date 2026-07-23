import { describe, it, expect, afterEach, vi } from "vitest";

// save.ts imports @/core/platform/location → expo-location, which has no
// vitest alias/mock (unlike expo-sqlite/expo-crypto/etc in vitest.config.ts)
// and fails to parse under Node ("Unknown file extension .ts" inside
// expo-modules-core). savePayeeLocationIfEnabled() is fire-and-forget and
// gated behind a feature flag we never enable here, so a bare stub is enough
// to let the module graph load; not a production code change.
vi.mock("expo-location", () => ({
  requestForegroundPermissionsAsync: vi.fn(),
  getForegroundPermissionsAsync: vi.fn(),
  getCurrentPositionAsync: vi.fn(),
}));

import { setupFixtures, closeTestDb, getTxnRow } from "./helpers";
import { saveTransaction } from "../save";
import type { SaveTransactionInput } from "../save";
import { first } from "@/core/db";

/**
 * Characterization tests for saveTransaction() (plan 002) — simple-new and
 * simple-edit paths. These pin CURRENT behavior; they are not a spec for how
 * the function *should* work. See plans/002-transactions-characterization-tests.md.
 */

function baseInput(overrides: Partial<SaveTransactionInput> = {}): SaveTransactionInput {
  return {
    account: "",
    date: 20260101,
    amount: 1000,
    type: "expense",
    payeeId: null,
    payeeName: "",
    categoryId: null,
    notes: null,
    cleared: false,
    splitCategories: null,
    ...overrides,
  };
}

describe("saveTransaction — simple-new", () => {
  afterEach(async () => {
    await closeTestDb();
  });

  it("expense: amount is stored negated", async () => {
    const { accountA, payeeId } = await setupFixtures();
    const id = await saveTransaction(baseInput({ account: accountA, amount: 1500, payeeId }));
    const row = await getTxnRow(id);
    expect(row?.amount).toBe(-1500);
  });

  it("income: amount is stored positive", async () => {
    const { accountA, payeeId } = await setupFixtures();
    const id = await saveTransaction(
      baseInput({ account: accountA, amount: 1500, type: "income", payeeId }),
    );
    const row = await getTxnRow(id);
    expect(row?.amount).toBe(1500);
  });

  it("payeeId null + payeeName set → resolves via findOrCreatePayee (new payee created)", async () => {
    const { accountA } = await setupFixtures();
    const id = await saveTransaction(
      baseInput({ account: accountA, payeeId: null, payeeName: "Brand New Payee" }),
    );
    const row = await getTxnRow(id);
    expect(row?.description).toBeTruthy();

    const payee = await first<{ name: string }>("SELECT name FROM payees WHERE id = ?", [
      row!.description!,
    ]);
    expect(payee?.name).toBe("Brand New Payee");
  });

  it("payeeId null + payeeName matching an existing payee (case-insensitive) → reuses it, no duplicate", async () => {
    const { accountA, payeeId } = await setupFixtures();
    const existing = await first<{ name: string }>("SELECT name FROM payees WHERE id = ?", [
      payeeId,
    ]);
    const id = await saveTransaction(
      baseInput({ account: accountA, payeeId: null, payeeName: existing!.name.toUpperCase() }),
    );
    const row = await getTxnRow(id);
    expect(row?.description).toBe(payeeId);
  });

  it("cleared flag round-trips through create", async () => {
    const { accountA, payeeId } = await setupFixtures();
    const id = await saveTransaction(baseInput({ account: accountA, payeeId, cleared: true }));
    const row = await getTxnRow(id);
    expect(row?.cleared).toBe(1);
  });

  it("no rules argument → category stays whatever was passed in (no auto-fill)", async () => {
    const { accountA, payeeId } = await setupFixtures();
    const id = await saveTransaction(baseInput({ account: accountA, payeeId, categoryId: null }));
    const row = await getTxnRow(id);
    expect(row?.category).toBeNull();
  });

  it("categoryId passed through untouched when set", async () => {
    const { accountA, payeeId, categoryId } = await setupFixtures();
    const id = await saveTransaction(baseInput({ account: accountA, payeeId, categoryId }));
    const row = await getTxnRow(id);
    expect(row?.category).toBe(categoryId);
  });
});

describe("saveTransaction — simple-edit", () => {
  afterEach(async () => {
    await closeTestDb();
  });

  it("updates account/date/amount/payee/category/notes/cleared to the new values", async () => {
    const { accountA, accountB, payeeId, categoryId, categoryId2 } = await setupFixtures();
    const id = await saveTransaction(
      baseInput({ account: accountA, payeeId, categoryId, notes: "original", amount: 1000 }),
    );

    await saveTransaction(
      baseInput({
        transactionId: id,
        account: accountB,
        payeeId,
        categoryId: categoryId2,
        notes: "edited",
        amount: 2000,
        cleared: true,
      }),
    );

    const row = await getTxnRow(id);
    expect(row?.acct).toBe(accountB);
    expect(row?.category).toBe(categoryId2);
    expect(row?.notes).toBe("edited");
    expect(row?.amount).toBe(-2000);
    expect(row?.cleared).toBe(1);
  });

  it("leaves fields not part of the simple-edit payload (e.g. sort_order) untouched", async () => {
    const { accountA, payeeId } = await setupFixtures();
    const id = await saveTransaction(baseInput({ account: accountA, payeeId }));
    const before = await getTxnRow(id);

    await saveTransaction(
      baseInput({ transactionId: id, account: accountA, payeeId, notes: "changed" }),
    );

    const after = await getTxnRow(id);
    expect(after?.sort_order).toBe(before?.sort_order);
    expect(after?.starting_balance_flag).toBe(before?.starting_balance_flag);
  });

  it("cleared flag round-trips through edit (true -> false)", async () => {
    const { accountA, payeeId } = await setupFixtures();
    const id = await saveTransaction(baseInput({ account: accountA, payeeId, cleared: true }));
    await saveTransaction(
      baseInput({ transactionId: id, account: accountA, payeeId, cleared: false }),
    );
    const row = await getTxnRow(id);
    expect(row?.cleared).toBe(0);
  });
});
