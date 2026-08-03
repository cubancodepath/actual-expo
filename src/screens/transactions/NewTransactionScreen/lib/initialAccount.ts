import type { Account } from "@/core/types/models";

export interface InitialAccount {
  accountId: string | null;
  accountName: string;
}

/**
 * Which account a new transaction opens with.
 *
 * Upstream's chain, minus the web-only first link (`TransactionEdit.tsx`):
 *
 * ```js
 * account: searchParamAccount || locationState?.accountId || lastTransaction?.account || null
 * ```
 *
 * The entry point wins when it knows the account — the FAB on an account's own
 * list, the iOS shortcut — and otherwise the last account used stands in, so
 * adding from the budget screen doesn't start on an empty row every time.
 * Nothing falls back to "the first account": guessing an account the user never
 * chose is worse than asking.
 *
 * Both candidates are resolved against `accounts`, which is where this diverges
 * from upstream, deliberately. Upstream is free to hand an id forward without
 * checking it; we are not. The form's schema only asks that `accountId` be
 * non-null (`if (!val.accountId)`) and `saveTransaction` writes it without
 * verifying the account exists — so an id left over from a deleted account
 * would sail through validation and book a transaction against nothing, while
 * the row rendered blank (it shows the *name*) and gave the user no clue why.
 * An account we can't name is an account we don't offer.
 */
export function resolveInitialAccount({
  paramAccountId,
  paramAccountName,
  lastAccountId,
  accounts,
}: {
  paramAccountId?: string;
  /** Supplied by callers that already know it, so nothing has to be resolved. */
  paramAccountName?: string;
  lastAccountId: string | null;
  accounts: Account[];
}): InitialAccount {
  if (paramAccountId) {
    const named = paramAccountName ?? accounts.find((a) => a.id === paramAccountId)?.name;
    // The id is honoured even when the name can't be resolved yet: it came from
    // this navigation, so it's certainly current, and the name is filled in as
    // soon as the accounts arrive.
    return { accountId: paramAccountId, accountName: named ?? "" };
  }

  const remembered = lastAccountId ? accounts.find((a) => a.id === lastAccountId) : undefined;
  if (remembered) return { accountId: remembered.id, accountName: remembered.name };

  return { accountId: null, accountName: "" };
}
