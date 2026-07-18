import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { RefreshControl, StyleSheet, View } from "react-native";
import { LegendList } from "@legendapp/list";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Menu, Spinner, useThemeColor } from "heroui-native";
import { ScreenHeader, useScreenHeaderScroll } from "@/ui/ScreenHeader";
import { useBudgetUIStore } from "@/stores/budgetUIStore";
import { useRefreshControl } from "@/hooks/useRefreshControl";
import { useIncomeCategoryIds } from "@/screens/transactions/hooks/useIncomeCategoryIds";
import { useTransactionActions } from "@/screens/transactions/hooks/useTransactionActions";
import type { TransactionDisplay } from "@/core/domain/transactions/types";
import { buildTxListItems, type TransactionsListContext, type TxListItem } from "../types";
import { useTransactionsListQuery } from "../hooks/useTransactionsListQuery";
import { DateHeader } from "./DateHeader";
import { EmptyTransactions } from "./EmptyTransactions";
import { TransactionRow } from "./TransactionRow";
import { TransactionRowMenu, type RowRect, type TransactionMenuAction } from "./TransactionRowMenu";

/** The long-pressed row the transaction menu is currently open on. */
interface MenuTarget {
  txn: TransactionDisplay;
  /** The row's window frame, measured at long-press. */
  rect: RowRect;
}

const noop = () => {};

interface TransactionsShellProps {
  /** Drives the query (all accounts / one account / one category+month). */
  context: TransactionsListContext;
  /** The `<ScreenHeader>` row — each variant composes its own. */
  header: ReactNode;
  /** Floating action button, when the variant has one. */
  fab?: ReactNode;
  /** Reserve the status bar height above the header (full-screen variants). */
  topInset?: boolean;
}

/**
 * Shared machinery of every transactions-list variant: the virtualized
 * date-grouped list, the long-press lift menu with its actions, and the
 * floating-header scaffold. Variants (all / account / category screens) compose
 * their header and FAB explicitly — no mode flags in here.
 */
export function TransactionsShell({
  context,
  header,
  fab,
  topInset = false,
}: TransactionsShellProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const actions = useTransactionActions();

  // One menu for the whole list, mounted only while a row is long-pressed (see
  // BudgetScreen for the pattern's rationale). `menuTarget` stores the whole
  // transaction so the floating preview renders even after the live row is
  // recycled off-screen by the virtualizer.
  const [menuTarget, setMenuTarget] = useState<MenuTarget | null>(null);
  const [isPreviewShown, setPreviewShown] = useState(false);

  // Unlike the budget screen, this one can be presented as a modal card, whose
  // root is offset from the window origin. Row frames are measured in window
  // coordinates, so anchoring the phantom Menu inside the root needs that
  // offset subtracted; the portal (overlay + preview) stays in window space.
  const rootRef = useRef<View>(null);
  const rootOffset = useRef({ x: 0, y: 0 });
  const measureRootOffset = useCallback(() => {
    rootRef.current?.measureInWindow((x, y) => {
      rootOffset.current = { x, y };
    });
  }, []);

  const onPressRow = useCallback(
    (txn: TransactionDisplay) => {
      router.push({ pathname: "/(auth)/transaction/new", params: { transactionId: txn.id } });
    },
    [router],
  );

  const onLongPressRow = useCallback((txn: TransactionDisplay, rect: RowRect) => {
    setPreviewShown(false);
    setMenuTarget({ txn, rect });
  }, []);

  const closeMenu = useCallback(() => {
    setMenuTarget(null);
    setPreviewShown(false);
  }, []);

  const liftedTxnId = isPreviewShown ? (menuTarget?.txn.id ?? null) : null;

  // Income categories get a distinct chip ("Income: X" + wallet icon).
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
    <View ref={rootRef} onLayout={measureRootOffset} className="flex-1 bg-background">
      <ScreenHeader.ScrollArea>
        <ListBody
          context={context}
          liftedTxnId={liftedTxnId}
          isIncomeTxn={isIncomeTxn}
          onPressRow={onPressRow}
          onLongPressRow={onLongPressRow}
        />

        <ScreenHeader.Floating>
          {topInset && <View style={{ height: insets.top }} />}
          {header}
        </ScreenHeader.Floating>
      </ScreenHeader.ScrollArea>

      {fab}

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

/**
 * The virtualized list. Split out so it can call `useScreenHeaderScroll`
 * (which needs the `ScreenHeader.ScrollArea` context) to drive the floating
 * header's blur and reserve top padding.
 */
function ListBody({
  context,
  liftedTxnId,
  isIncomeTxn,
  onPressRow,
  onLongPressRow,
}: {
  context: TransactionsListContext;
  liftedTxnId: string | null;
  isIncomeTxn: (txn: TransactionDisplay) => boolean;
  onPressRow: (txn: TransactionDisplay) => void;
  onLongPressRow: (txn: TransactionDisplay, rect: RowRect) => void;
}) {
  const accent = useThemeColor("accent");
  const { onScroll, contentPaddingTop } = useScreenHeaderScroll();
  const { refreshControlProps } = useRefreshControl();

  // The category context defaults to the budget UI store's month.
  const storeMonth = useBudgetUIStore((s) => s.month);
  const month = (context.kind === "category" && context.month) || storeMonth;

  const { transactions, fetchNextPage, hasNextPage, isFetchingNextPage, isPending } =
    useTransactionsListQuery(context, month);
  const items = useMemo(() => buildTxListItems(transactions), [transactions]);

  const renderItem = useCallback(
    ({ item }: { item: TxListItem }) => {
      if (item.type === "header") return <DateHeader date={item.date} />;
      return (
        <TransactionRow
          txn={item.txn}
          isFirst={item.isFirst}
          isIncome={isIncomeTxn(item.txn)}
          onPress={onPressRow}
          onLongPress={onLongPressRow}
          isLifted={liftedTxnId === item.txn.id}
        />
      );
    },
    [onPressRow, onLongPressRow, liftedTxnId, isIncomeTxn],
  );

  return (
    <LegendList
      data={items}
      keyExtractor={(item: TxListItem) => item.key}
      getItemType={(item: TxListItem) => item.type}
      extraData={liftedTxnId}
      renderItem={renderItem}
      onScroll={onScroll}
      scrollEventThrottle={16}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingTop: contentPaddingTop, paddingBottom: 80 }}
      onEndReached={() => {
        if (hasNextPage) fetchNextPage();
      }}
      onEndReachedThreshold={0.3}
      ListFooterComponent={
        isFetchingNextPage ? (
          <View className="items-center py-5">
            <Spinner size="sm" color={accent} />
          </View>
        ) : null
      }
      ListEmptyComponent={isPending ? null : <EmptyTransactions />}
      refreshControl={
        <RefreshControl
          refreshing={refreshControlProps.refreshing}
          onRefresh={refreshControlProps.onRefresh}
          tintColor={refreshControlProps.tintColor}
        />
      }
    />
  );
}
