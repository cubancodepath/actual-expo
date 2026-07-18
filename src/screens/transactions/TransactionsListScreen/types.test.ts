import { describe, expect, it } from "vitest";
import { buildTxListItems } from "./types";
import type { TransactionDisplay } from "@/core/domain/transactions/types";

function txn(id: string, date: number): TransactionDisplay {
  return {
    id,
    date,
    amount: -1000,
    account: "acc1",
    category: "cat1",
    payee: "pay1",
    notes: null,
    parent_id: null,
    transfer_id: null,
    is_parent: false,
    is_child: false,
    cleared: false,
    reconciled: false,
    sort_order: null,
    starting_balance_flag: false,
    schedule: null,
    tombstone: false,
    payeeName: "Payee",
    categoryName: "Category",
    accountName: "Account",
  };
}

describe("buildTxListItems", () => {
  it("returns empty for no transactions", () => {
    expect(buildTxListItems([])).toEqual([]);
  });

  it("inserts a header per date and marks isFirst/isLast", () => {
    const items = buildTxListItems([txn("a", 20260715), txn("b", 20260715), txn("c", 20260714)]);
    expect(items.map((i) => i.type)).toEqual([
      "header",
      "transaction",
      "transaction",
      "header",
      "transaction",
    ]);
    expect(items[0]).toMatchObject({ key: "date-20260715", date: 20260715 });
    expect(items[1]).toMatchObject({ key: "a", isFirst: true, isLast: false });
    expect(items[2]).toMatchObject({ key: "b", isFirst: false, isLast: true });
    expect(items[4]).toMatchObject({ key: "c", isFirst: true, isLast: true });
  });

  it("a single transaction is both first and last of its block", () => {
    const items = buildTxListItems([txn("only", 20260701)]);
    expect(items).toHaveLength(2);
    expect(items[1]).toMatchObject({ isFirst: true, isLast: true });
  });
});
