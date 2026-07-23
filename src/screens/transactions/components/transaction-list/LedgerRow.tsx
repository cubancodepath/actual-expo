import { memo, type ComponentType } from "react";
import { TransactionRow, type LedgerRowProps } from "./TransactionRow";

export type { LedgerRowProps };

/** A row variant a list (and its menu host's floating preview) renders with. */
export type LedgerRowComponent = ComponentType<LedgerRowProps>;

/**
 * The standard ledger row: category chip + account name. Used wherever rows
 * from many accounts mix (all-transactions tab, category ledger, search).
 * Memoized so paging in more rows doesn't re-render the existing ones.
 */
export const LedgerRow = memo(function LedgerRow(props: LedgerRowProps) {
  return (
    <TransactionRow.Root {...props}>
      <TransactionRow.Main>
        <TransactionRow.Payee />
        <TransactionRow.Amount />
      </TransactionRow.Main>
      <TransactionRow.Meta>
        <TransactionRow.CategoryChip />
        <TransactionRow.Account />
      </TransactionRow.Meta>
    </TransactionRow.Root>
  );
});

/**
 * The account-detail variant: no account name — every row belongs to the
 * account you're already looking at.
 */
export const AccountLedgerRow = memo(function AccountLedgerRow(props: LedgerRowProps) {
  return (
    <TransactionRow.Root {...props}>
      <TransactionRow.Main>
        <TransactionRow.Payee />
        <TransactionRow.Amount />
      </TransactionRow.Main>
      <TransactionRow.Meta>
        <TransactionRow.CategoryChip />
      </TransactionRow.Meta>
    </TransactionRow.Root>
  );
});
