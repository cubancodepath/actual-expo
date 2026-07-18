import { useCallback, useMemo, type ReactNode } from "react";
import { RefreshControl, View } from "react-native";
import { LegendList } from "@legendapp/list";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Spinner, useThemeColor } from "heroui-native";
import { ScreenHeader, useScreenHeaderScroll } from "@/ui/ScreenHeader";
import { useBudgetUIStore } from "@/stores/budgetUIStore";
import { useRefreshControl } from "@/hooks/useRefreshControl";
import { DateHeader } from "@/screens/transactions/components/transaction-list/DateHeader";
import { EmptyTransactions } from "@/screens/transactions/components/transaction-list/EmptyTransactions";
import { TransactionRow } from "@/screens/transactions/components/transaction-list/TransactionRow";
import { TransactionRowMenuHost } from "@/screens/transactions/components/transaction-list/TransactionRowMenuHost";
import {
  buildTxListItems,
  type TxListItem,
} from "@/screens/transactions/components/transaction-list/listItems";
import type { RowRect } from "@/screens/transactions/components/transaction-list/TransactionRowMenu";
import type { TransactionDisplay } from "@/core/domain/transactions/types";
import type { TransactionsListContext } from "../types";
import { useTransactionsListQuery } from "../hooks/useTransactionsListQuery";

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

  const onPressRow = useCallback(
    (txn: TransactionDisplay) => {
      router.push({ pathname: "/(auth)/transaction/new", params: { transactionId: txn.id } });
    },
    [router],
  );

  return (
    <TransactionRowMenuHost className="flex-1 bg-background">
      {({ liftedTxnId, onLongPressRow, isIncomeTxn }) => (
        <>
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
        </>
      )}
    </TransactionRowMenuHost>
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
