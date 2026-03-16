import { useCallback, useEffect, useLayoutEffect, useMemo } from "react";
import { ActivityIndicator, RefreshControl, View } from "react-native";
import { LegendList } from "@legendapp/list";
import { Stack, useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../../src/presentation/providers/ThemeProvider";
import { EmptyState } from "../../../src/presentation/components";
import { IconButton } from "../../../src/presentation/components/atoms/IconButton";
import { TransactionRow } from "../../../src/presentation/components/account/TransactionRow";
import { DateSectionHeader } from "../../../src/presentation/components/account/DateSectionHeader";
import { SelectModeToolbar } from "../../../src/presentation/components/transaction/SelectModeToolbar";
import { transactionQuery } from "../../../src/transactions/query";
import { useBudgetStore } from "../../../src/stores/budgetStore";
import { useUndoStore } from "../../../src/stores/undoStore";
import { useTagsStore } from "../../../src/stores/tagsStore";
import {
  useSelectModeHeader,
  useTransactionList,
  type ListItem,
} from "../../../src/presentation/hooks/transactionList";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert 'YYYY-MM' → YYYYMM01 integer */
function monthToStartInt(month: string): number {
  return parseInt(month.replace("-", "") + "01", 10);
}

/** Convert 'YYYY-MM' → first day of NEXT month as YYYYMM01 integer */
function monthToNextStartInt(month: string): number {
  const [y, m] = month.split("-").map(Number);
  const nextMonth = m === 12 ? 1 : m + 1;
  const nextYear = m === 12 ? y + 1 : y;
  return nextYear * 10000 + nextMonth * 100 + 1;
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function CategoryTransactionsScreen() {
  const { t } = useTranslation("budget");
  const { colors } = useTheme();
  const router = useRouter();
  const navigation = useNavigation();
  const { categoryId, categoryName } = useLocalSearchParams<{
    categoryId: string;
    categoryName: string;
  }>();

  const month = useBudgetStore((s) => s.month);
  const undoVersion = useUndoStore((s) => s.undoVersion);
  const tags = useTagsStore((s) => s.tags);

  const startOfMonth = useMemo(() => monthToStartInt(month), [month]);
  const startOfNextMonth = useMemo(() => monthToNextStartInt(month), [month]);

  // ---- Data fetching ----
  const fetchTransactions = useCallback(
    (limit: number, offset: number) =>
      transactionQuery()
        .alive()
        .withCategory(categoryId)
        .filter("t.date >= ? AND t.date < ?", [startOfMonth, startOfNextMonth])
        .includeAccountName()
        .includeSplitDetails()
        .limit(limit)
        .offset(offset)
        .execute(),
    [categoryId, startOfMonth, startOfNextMonth],
  );

  const txnList = useTransactionList({
    fetchTransactions,
    moveMode: "remap",
  });

  // ---- Select mode header ----
  useSelectModeHeader({
    isSelectMode: txnList.isSelectMode,
    selectedCount: txnList.selectedIds.size,
    selectedTotal: txnList.selectedTotal,
    onSelectAll: txnList.handleSelectAll,
    onDoneSelection: txnList.handleDoneSelection,
  });

  // ---- Normal-mode header ----
  useLayoutEffect(() => {
    if (txnList.isSelectMode) return;
    navigation.setOptions({
      title: categoryName ?? t("transactions"),
      headerLeft: () => (
        <IconButton
          sfSymbol="xmark"
          size={22}
          color={colors.headerText}
          onPress={() => router.back()}
        />
      ),
    });
  }, [categoryName, txnList.isSelectMode, colors.headerText]);

  // ---- Data loading ----
  useFocusEffect(
    useCallback(() => {
      if (!txnList.hasLoaded.current) {
        txnList.loadAll();
        txnList.hasLoaded.current = true;
      } else {
        txnList.silentRefresh();
      }
      return () => {
        txnList.resetSelection();
      };
    }, [txnList.loadAll, txnList.silentRefresh, txnList.resetSelection]),
  );

  // Refresh after undo
  useEffect(() => {
    if (undoVersion > 0) {
      setTimeout(() => {
        txnList.restoreDeleted();
        txnList.restoreBulkDeleted();
        txnList.silentRefresh();
      }, 0);
    }
  }, [undoVersion]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.pageBackground }}>
      {txnList.loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <LegendList
          data={txnList.listData}
          keyExtractor={(item) => item.key}
          getItemType={(item) => item.type}
          extraData={`${txnList.isSelectMode}-${txnList.selectedIds.size}`}
          scrollEventThrottle={16}
          renderItem={({ item }) => {
            if (item.type === "date") {
              return <DateSectionHeader date={item.date} />;
            }
            if (item.type !== "transaction") return null;
            return (
              <TransactionRow
                item={item.data}
                onPress={txnList.handleEditTransaction}
                onDelete={txnList.handleDelete}
                onToggleCleared={txnList.handleToggleCleared}
                onLongPress={txnList.handleLongPress}
                onDuplicate={txnList.handleDuplicate}
                onMove={txnList.handleMove}
                onSetCategory={txnList.handleSetCategory}
                onAddTag={txnList.handleAddTag}
                tags={tags}
                isFirst={item.isFirst}
                isLast={item.isLast}
                isSelectMode={txnList.isSelectMode}
                isSelected={txnList.selectedIds.has(item.data.id)}
                showAccountName
              />
            );
          }}
          ListFooterComponent={
            txnList.loadingMore ? (
              <ActivityIndicator color={colors.primary} style={{ paddingVertical: 20 }} />
            ) : null
          }
          ListEmptyComponent={
            <EmptyState
              icon="receipt-outline"
              title={t("noTransactions")}
              description={t("noTransactionsForCategory", { name: categoryName ?? t("category") })}
            />
          }
          onEndReached={txnList.loadMore}
          onEndReachedThreshold={0.3}
          contentContainerStyle={{ paddingBottom: 80 }}
          refreshControl={<RefreshControl {...txnList.refreshControlProps} />}
        />
      )}

      {txnList.isSelectMode && (
        <SelectModeToolbar
          allCleared={txnList.allCleared}
          selectedCount={txnList.selectedIds.size}
          onToggleCleared={txnList.handleBulkToggleCleared}
          onDelete={txnList.handleBulkDelete}
          onMove={txnList.triggerAccountPicker}
          onSetCategory={txnList.triggerCategoryPicker}
        />
      )}

      {!txnList.isSelectMode && (
        <Stack.Toolbar placement="right">
          <Stack.Toolbar.Button onPress={txnList.enterSelectMode}>
            {t("select")}
          </Stack.Toolbar.Button>
        </Stack.Toolbar>
      )}
    </View>
  );
}
