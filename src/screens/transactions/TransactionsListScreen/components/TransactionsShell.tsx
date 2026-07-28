import { useCallback, useMemo, type ReactNode } from "react";
import { View, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { LegendList } from "@legendapp/list";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Spinner, useThemeColor } from "heroui-native";
import { ScreenHeader, useScreenHeaderScroll } from "@/ui/ScreenHeader";
import { useBudgetUIStore } from "@/stores/budgetUIStore";
import { useSyncRefreshControl } from "@/lib/hooks/useSyncRefreshControl";
import { DateHeader } from "@/screens/transactions/components/transaction-list/DateHeader";
import { EmptyTransactions } from "@/screens/transactions/components/transaction-list/EmptyTransactions";
import {
  LedgerRow,
  type LedgerRowComponent,
} from "@/screens/transactions/components/transaction-list/LedgerRow";
import { TransactionRowMenuHost } from "@/screens/transactions/components/transaction-list/TransactionRowMenuHost";
import { UpcomingSection } from "@/screens/transactions/components/transaction-list/UpcomingSection";
import { useSchedulePreviews } from "@/screens/transactions/hooks/useSchedulePreviews";
import { useScheduleRecurringMap } from "@/screens/transactions/hooks/useScheduleRecurringMap";
import {
  buildTxListItems,
  type TxListItem,
} from "@/screens/transactions/components/transaction-list/listItems";
import type { RowRect } from "@/ui/lift-menu";
import type { TransactionDisplay } from "@/core/types/models";
import type { TransactionsListContext } from "../types";
import { useTransactionsListQuery } from "../hooks/useTransactionsListQuery";
import { useSurfaceLevel } from "@/ui/surface-level";

interface TransactionsShellProps {
  /** Drives the query (all accounts / one account / one category+month). */
  context: TransactionsListContext;
  /**
   * The `<ScreenHeader>` row rendered in the frosted floating overlay (blur
   * ramps on scroll). Mutually exclusive with `stickyHeader`.
   */
  header?: ReactNode;
  /**
   * A dedicated solid header rendered as a normal flex child above the list
   * (no ScreenHeader scaffold, no blur, never scrolls). Used by the account
   * detail screen for its pinned balance summary. Mutually exclusive with
   * `header`.
   */
  stickyHeader?: ReactNode;
  /** Floating action button, when the variant has one. */
  fab?: ReactNode;
  /** Reserve the status bar height above the header (frosted variants). */
  topInset?: boolean;
  /**
   * The ledger-row variant to render (see `LedgerRow.tsx`). The account detail
   * screen passes `AccountLedgerRow` to drop the redundant account name.
   */
  rowComponent?: LedgerRowComponent;
}

/**
 * Shared machinery of every transactions-list variant: the virtualized
 * date-grouped list, the long-press lift menu with its actions, and the header
 * scaffold. Variants compose their header and FAB explicitly: `header` renders
 * a frosted floating overlay (all / category), while `stickyHeader` renders a
 * solid pinned header above the list (account detail).
 */
export function TransactionsShell({
  context,
  header,
  stickyHeader,
  fab,
  topInset = false,
  rowComponent = LedgerRow,
}: TransactionsShellProps) {
  const { canvas } = useSurfaceLevel();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const onPressRow = useCallback(
    (txn: TransactionDisplay) => {
      router.push({ pathname: "/(auth)/transaction/new", params: { transactionId: txn.id } });
    },
    [router],
  );

  return (
    <TransactionRowMenuHost className={`flex-1 ${canvas}`} rowComponent={rowComponent}>
      {({ liftedTxnId, onLongPressRow, isIncomeTxn }) => {
        const listProps = {
          context,
          liftedTxnId,
          isIncomeTxn,
          onPressRow,
          onLongPressRow,
          rowComponent,
        };
        return (
          <>
            {stickyHeader ? (
              <>
                {stickyHeader}
                <ListBody {...listProps} contentPaddingTop={0} />
              </>
            ) : (
              <ScreenHeader.ScrollArea>
                <FrostedList {...listProps}>
                  <ScreenHeader.Floating>
                    {topInset && <View style={{ height: insets.top }} />}
                    {header}
                  </ScreenHeader.Floating>
                </FrostedList>
              </ScreenHeader.ScrollArea>
            )}

            {fab}
          </>
        );
      }}
    </TransactionRowMenuHost>
  );
}

/**
 * Frosted-header wrapper: lives inside `ScreenHeader.ScrollArea` so it can call
 * `useScreenHeaderScroll` (drives the floating header's blur and the list's top
 * padding), then feeds those into the shared `ListBody`.
 */
function FrostedList({ children, ...listProps }: ListBodyProps & { children: ReactNode }) {
  const { onScroll, contentPaddingTop } = useScreenHeaderScroll();
  return (
    <>
      <ListBody {...listProps} onScroll={onScroll} contentPaddingTop={contentPaddingTop} />
      {children}
    </>
  );
}

interface ListBodyProps {
  context: TransactionsListContext;
  liftedTxnId: string | null;
  isIncomeTxn: (txn: TransactionDisplay) => boolean;
  onPressRow: (txn: TransactionDisplay) => void;
  onLongPressRow: (txn: TransactionDisplay, rect: RowRect) => void;
  rowComponent: LedgerRowComponent;
  /** Header-blur scroll handler (frosted mode only). */
  onScroll?: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
  /** Top padding reserved for the floating header (0 in sticky mode). */
  contentPaddingTop?: number;
}

/**
 * The virtualized list. Header-scroll wiring is injected via props so the same
 * list serves both the frosted (floating header) and sticky (solid header)
 * modes without touching the shared ScreenHeader.
 */
function ListBody({
  context,
  liftedTxnId,
  isIncomeTxn,
  onPressRow,
  onLongPressRow,
  rowComponent: RowComponent,
  onScroll,
  contentPaddingTop = 0,
}: ListBodyProps) {
  const accent = useThemeColor("accent");
  const refreshControl = useSyncRefreshControl();

  // The category context defaults to the budget UI store's month.
  const storeMonth = useBudgetUIStore((s) => s.month);
  const month = (context.kind === "category" && context.month) || storeMonth;

  const { transactions, fetchNextPage, hasNextPage, isFetchingNextPage, isPending } =
    useTransactionsListQuery(context, month);
  const items = useMemo(() => buildTxListItems(transactions), [transactions]);

  // Upcoming schedule previews, shown in a collapsed accordion at the top of
  // the list (scrolls with the content — not pinned).
  const { previews } = useSchedulePreviews(context);
  // scheduleId → recurring?, to pick the ledger's schedule-link icon.
  const scheduleRecurring = useScheduleRecurringMap();

  const renderItem = useCallback(
    ({ item }: { item: TxListItem }) => {
      if (item.type === "header") return <DateHeader date={item.date} />;
      const scheduleKind = item.txn.schedule
        ? scheduleRecurring.get(item.txn.schedule)
          ? "recurring"
          : "once"
        : null;
      return (
        <RowComponent
          txn={item.txn}
          isFirst={item.isFirst}
          isIncome={isIncomeTxn(item.txn)}
          scheduleKind={scheduleKind}
          onPress={onPressRow}
          onLongPress={onLongPressRow}
          isLifted={liftedTxnId === item.txn.id}
        />
      );
    },
    [onPressRow, onLongPressRow, liftedTxnId, isIncomeTxn, scheduleRecurring, RowComponent],
  );

  return (
    <LegendList
      data={items}
      keyExtractor={(item: TxListItem) => item.key}
      getItemType={(item: TxListItem) => item.type}
      extraData={liftedTxnId}
      renderItem={renderItem}
      // Fill the space below a sticky (solid) header; harmless in frosted mode
      // where the list is the sole in-flow child.
      style={{ flex: 1 }}
      onScroll={onScroll}
      scrollEventThrottle={16}
      showsVerticalScrollIndicator={false}
      // Top-anchored ledger that paginates downward: LegendList's default
      // maintainVisibleContentPosition (for chat-style prepend lists) fights the
      // async header paddingTop, opening the list slightly scrolled. Disable it.
      maintainVisibleContentPosition={false}
      contentContainerStyle={{ paddingTop: contentPaddingTop, paddingBottom: 80 }}
      ListHeaderComponent={
        previews.length > 0 ? <UpcomingSection previews={previews} /> : undefined
      }
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
      refreshControl={refreshControl}
    />
  );
}
