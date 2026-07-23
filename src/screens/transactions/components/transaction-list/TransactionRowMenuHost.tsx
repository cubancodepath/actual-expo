import { useCallback, type ReactNode } from "react";
import { useRouter } from "expo-router";
import { useIncomeCategoryIds } from "@/screens/transactions/hooks/useIncomeCategoryIds";
import { useTransactionActions } from "@/screens/transactions/hooks/useTransactionActions";
import type { TransactionDisplay } from "@/core/types/models";
import { LiftMenu, type RowRect } from "@/ui/lift-menu";
import { LedgerRow, type LedgerRowComponent } from "./LedgerRow";
import { TransactionRowMenu, type TransactionMenuAction } from "./TransactionRowMenu";

const noop = () => {};

interface TransactionRowMenuHostRenderProps {
  /** Row whose floating preview is up — that row hides itself. */
  liftedTxnId: string | null;
  /** Wire to each row's `onLongPress` to open the menu on it. */
  onLongPressRow: (txn: TransactionDisplay, rect: RowRect) => void;
  /** Income categories get a distinct chip ("Income: X" + wallet icon). */
  isIncomeTxn: (txn: TransactionDisplay) => boolean;
}

interface TransactionRowMenuHostProps {
  className?: string;
  /**
   * The row variant the list renders with — the floating preview clones it so
   * the lift matches the live row pixel-for-pixel.
   */
  rowComponent?: LedgerRowComponent;
  children: (props: TransactionRowMenuHostRenderProps) => ReactNode;
}

/**
 * `LiftMenu.Host` specialization shared by every surface that lists transaction
 * rows (the list screens' shell, search). Routes the menu's actions
 * (categorize / move / clear / duplicate / delete) through
 * `useTransactionActions` and the router.
 */
export function TransactionRowMenuHost({
  className,
  rowComponent: RowComponent = LedgerRow,
  children,
}: TransactionRowMenuHostProps) {
  const router = useRouter();
  const actions = useTransactionActions();

  const incomeCategoryIds = useIncomeCategoryIds();
  const isIncomeTxn = useCallback(
    (txn: TransactionDisplay) => txn.category != null && incomeCategoryIds.has(txn.category),
    [incomeCategoryIds],
  );

  const handleMenuAction = (txn: TransactionDisplay, action: TransactionMenuAction) => {
    switch (action) {
      case "categorize":
        router.push({
          pathname: "/(auth)/transaction-categorize",
          params: { transactionId: txn.id },
        });
        break;
      case "move":
        router.push({ pathname: "/(auth)/transaction-move", params: { transactionId: txn.id } });
        break;
      case "toggleCleared":
        actions.toggleClearedGuarded(txn);
        break;
      case "duplicate":
        actions.duplicate(txn.id);
        break;
      case "delete":
        void actions.deleteWithConfirm(txn);
        break;
    }
  };

  return (
    <LiftMenu.Host<TransactionDisplay>
      getId={(txn) => txn.id}
      className={className}
      renderMenu={(txn) => (
        <TransactionRowMenu
          cleared={txn.cleared}
          onAction={(action) => handleMenuAction(txn, action)}
          preview={
            <RowComponent
              txn={txn}
              isFirst
              isIncome={isIncomeTxn(txn)}
              onPress={noop}
              onLongPress={noop}
            />
          }
        />
      )}
    >
      {({ liftedId, onLongPressRow }) =>
        children({ liftedTxnId: liftedId, onLongPressRow, isIncomeTxn })
      }
    </LiftMenu.Host>
  );
}
