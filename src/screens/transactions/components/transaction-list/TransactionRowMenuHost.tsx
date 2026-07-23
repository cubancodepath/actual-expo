import { useCallback, useRef, useState, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { Menu } from "heroui-native";
import { useIncomeCategoryIds } from "@/screens/transactions/hooks/useIncomeCategoryIds";
import { useTransactionActions } from "@/screens/transactions/hooks/useTransactionActions";
import type { TransactionDisplay } from "@/core/types/models";
import { TransactionRow } from "./TransactionRow";
import { TransactionRowMenu, type RowRect, type TransactionMenuAction } from "./TransactionRowMenu";

/** The long-pressed row the transaction menu is currently open on. */
interface MenuTarget {
  txn: TransactionDisplay;
  /** The row's window frame, measured at long-press. */
  rect: RowRect;
}

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
  children: (props: TransactionRowMenuHostRenderProps) => ReactNode;
}

/**
 * Root view + single long-press "lift" menu shared by every surface that lists
 * transaction rows (the list screens' shell, search). One menu for the whole
 * list, mounted only while a row is long-pressed (see BudgetScreen for the
 * pattern's rationale). `menuTarget` stores the whole transaction so the
 * floating preview renders even after the live row is recycled off-screen by
 * the virtualizer. Routes the menu's actions (categorize / move / clear /
 * duplicate / delete) through `useTransactionActions` and the router.
 */
export function TransactionRowMenuHost({ className, children }: TransactionRowMenuHostProps) {
  const router = useRouter();
  const actions = useTransactionActions();

  const [menuTarget, setMenuTarget] = useState<MenuTarget | null>(null);
  const [isPreviewShown, setPreviewShown] = useState(false);

  // The host can live inside a modal card, whose root is offset from the
  // window origin. Row frames are measured in window coordinates, so anchoring
  // the phantom Menu inside the root needs that offset subtracted; the portal
  // (overlay + preview) stays in window space.
  const rootRef = useRef<View>(null);
  const rootOffset = useRef({ x: 0, y: 0 });
  const measureRootOffset = useCallback(() => {
    rootRef.current?.measureInWindow((x, y) => {
      rootOffset.current = { x, y };
    });
  }, []);

  const onLongPressRow = useCallback((txn: TransactionDisplay, rect: RowRect) => {
    setPreviewShown(false);
    setMenuTarget({ txn, rect });
  }, []);

  const closeMenu = useCallback(() => {
    setMenuTarget(null);
    setPreviewShown(false);
  }, []);

  const liftedTxnId = isPreviewShown ? (menuTarget?.txn.id ?? null) : null;

  const incomeCategoryIds = useIncomeCategoryIds();
  const isIncomeTxn = useCallback(
    (txn: TransactionDisplay) => txn.category != null && incomeCategoryIds.has(txn.category),
    [incomeCategoryIds],
  );

  const handleMenuAction = (action: TransactionMenuAction) => {
    if (!menuTarget) return;
    const txn = menuTarget.txn;
    closeMenu();
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
    <View ref={rootRef} onLayout={measureRootOffset} className={className}>
      {children({ liftedTxnId, onLongPressRow, isIncomeTxn })}

      {/* See BudgetScreen for the single-menu pattern; here the anchor position
          additionally subtracts the root's own window offset (modal cards). */}
      {menuTarget && (
        <Menu
          isDefaultOpen
          onOpenChange={(open) => {
            if (!open) closeMenu();
          }}
          pointerEvents="none" // purely a measuring anchor; never takes touches
          style={{
            position: "absolute",
            left: menuTarget.rect.x - rootOffset.current.x,
            top: menuTarget.rect.y - rootOffset.current.y,
            width: menuTarget.rect.width,
            height: menuTarget.rect.height,
          }}
        >
          <Menu.Trigger pointerEvents="none" style={StyleSheet.absoluteFill} />
          <TransactionRowMenu
            rect={menuTarget.rect}
            cleared={menuTarget.txn.cleared}
            onAction={handleMenuAction}
            onPreviewLayout={() => setPreviewShown(true)}
            preview={
              <TransactionRow
                txn={menuTarget.txn}
                isFirst
                isIncome={isIncomeTxn(menuTarget.txn)}
                onPress={noop}
                onLongPress={noop}
              />
            }
          />
        </Menu>
      )}
    </View>
  );
}
