import { useCallback, useMemo, type ReactNode } from "react";
import { Platform, View, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
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

/**
 * How far a plain navigation bar reaches below the safe area.
 *
 * Standard bar metrics rather than a measured height: reading the real one
 * means taking on `@react-navigation/elements` for a single number, and the
 * bars this clears carry a title and bar items, nothing taller.
 */
const NAV_BAR_HEIGHT = Platform.select({ ios: 44, default: 56 });

interface TransactionsShellProps {
  /** Drives the query (all accounts / one account / one category+month). */
  context: TransactionsListContext;
  /**
   * The `<ScreenHeader>` row rendered in the frosted floating overlay (blur
   * ramps on scroll). The legacy path — only the category screen is left on it,
   * and it's mutually exclusive with `banner`.
   */
  header?: ReactNode;
  /**
   * A solid block pinned between the native bar and the list; never scrolls.
   * The account ledger's balance summary, in the shape the budget screen's
   * ReadyToAssign banner established.
   */
  banner?: ReactNode;
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
 * scaffold.
 *
 * Two shapes. The native one — a `banner` (or nothing) under a real navigation
 * bar, optionally searching in place — is where the ledgers live. The frosted
 * one (`header` inside a `ScreenHeader.Floating`) is what the category screen
 * still uses; it stays until that screen migrates too.
 */
export function TransactionsShell({
  context,
  header,
  banner,
  fab,
  topInset = false,
  rowComponent = LedgerRow,
}: TransactionsShellProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // A translucent bar floats OVER the content instead of occupying layout, so
  // whatever comes first has to clear it by hand. Deliberately padding rather
  // than `contentInsetAdjustmentBehavior`: an adjusted content offset is read
  // as a scroll position by the virtualized list, which then computes its
  // window off the end of the data and renders nothing.
  const topPad = insets.top + NAV_BAR_HEIGHT;

  const onPressRow = useCallback(
    (txn: TransactionDisplay) => {
      router.push({ pathname: "/(auth)/transaction/new", params: { transactionId: txn.id } });
    },
    [router],
  );

  return (
    <TransactionRowMenuHost className="flex-1 bg-background" rowComponent={rowComponent}>
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
            {header ? (
              <ScreenHeader.ScrollArea>
                <FrostedList {...listProps}>
                  <ScreenHeader.Floating>
                    {topInset && <View style={{ height: insets.top }} />}
                    {header}
                  </ScreenHeader.Floating>
                </FrostedList>
              </ScreenHeader.ScrollArea>
            ) : (
              <>
                {/* Whichever is on top pays for the bar; the other starts at 0. */}
                {banner ? <View style={{ paddingTop: topPad }}>{banner}</View> : null}
                <ListBody {...listProps} contentPaddingTop={banner ? 0 : topPad} />
              </>
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
  /** Top padding reserved for the floating header. */
  contentPaddingTop?: number;
}

/**
 * The virtualized list. Header wiring is injected via props so the same list
 * serves the frosted overlay and the native bar without touching either.
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
  const refreshControl = useSyncRefreshControl(contentPaddingTop);

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
      // Tapping a result while the keyboard is still animating out must land on
      // the first tap.
      keyboardShouldPersistTaps="handled"
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
