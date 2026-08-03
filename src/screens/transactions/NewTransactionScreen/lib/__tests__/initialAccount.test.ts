import { describe, it, expect } from "vitest";
import { resolveInitialAccount } from "../initialAccount";
import type { Account } from "@/core/types/models";

function account(id: string, name: string): Account {
  return {
    id,
    name,
    offbudget: false,
    closed: false,
    tombstone: false,
    sort_order: 0,
    last_reconciled: null,
  };
}

const ACCOUNTS = [account("checking", "Checking"), account("savings", "Savings")];

describe("resolveInitialAccount", () => {
  it("takes the account the caller asked for", () => {
    expect(
      resolveInitialAccount({
        paramAccountId: "savings",
        lastAccountId: "checking",
        accounts: ACCOUNTS,
      }),
    ).toEqual({ accountId: "savings", accountName: "Savings" });
  });

  it("uses the name the caller supplied without looking it up", () => {
    expect(
      resolveInitialAccount({
        paramAccountId: "savings",
        paramAccountName: "Savings",
        lastAccountId: null,
        accounts: [],
      }),
    ).toEqual({ accountId: "savings", accountName: "Savings" });
  });

  it("keeps a requested id even when the accounts haven't loaded", () => {
    // The id came from this navigation, so it is current; the name gets filled
    // in by the form once the accounts arrive.
    expect(
      resolveInitialAccount({ paramAccountId: "savings", lastAccountId: null, accounts: [] }),
    ).toEqual({ accountId: "savings", accountName: "" });
  });

  it("falls back to the last account used", () => {
    expect(resolveInitialAccount({ lastAccountId: "checking", accounts: ACCOUNTS })).toEqual({
      accountId: "checking",
      accountName: "Checking",
    });
  });

  it("ignores a remembered account that no longer exists, rather than booking against it", () => {
    // The schema only asks that accountId be non-null and the save writes it
    // unchecked, so a ghost id would pass validation and leave the row blank.
    expect(resolveInitialAccount({ lastAccountId: "deleted", accounts: ACCOUNTS })).toEqual({
      accountId: null,
      accountName: "",
    });
  });

  it("ignores the remembered account while the accounts are still loading", () => {
    expect(resolveInitialAccount({ lastAccountId: "checking", accounts: [] })).toEqual({
      accountId: null,
      accountName: "",
    });
  });

  it("never guesses an account when there is nothing to go on", () => {
    expect(resolveInitialAccount({ lastAccountId: null, accounts: ACCOUNTS })).toEqual({
      accountId: null,
      accountName: "",
    });
  });
});
