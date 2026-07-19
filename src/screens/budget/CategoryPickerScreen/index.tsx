import { Fragment, useMemo, useState } from "react";
import { ScrollView, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { ListGroup, SearchField, Separator, Typography } from "heroui-native";
import { useBudgetUIStore } from "@/stores/budgetUIStore";
import { useCategories } from "@/lib/hooks/useCategories";
import { useSheetValueNumber, useSpreadsheetVersionWhere } from "@/hooks/useSheetValue";
import { makeCategoryCellMatcher } from "@/screens/budget/hooks/useOverspentCategories";
import { envelopeBudget, sheetForMonth } from "@/core/domain/spreadsheet/bindings";
import { getSpreadsheet } from "@/core/domain/spreadsheet/instance";
import { TO_BUDGET_ID } from "@/screens/budget/constants";
import { Money } from "@/ui/Money";

/**
 * Which side of a transfer the picked category will be on. A `funder` gives
 * money, so only categories with a positive balance qualify; a `receiver` takes
 * it, and any expense category can.
 */
export type PickerRole = "funder" | "receiver";

interface PickableCategory {
  id: string;
  name: string;
  balance: number;
}

interface PickableGroup {
  id: string;
  name: string;
  categories: PickableCategory[];
}

/**
 * Category picker for the transfer flows: expense categories minus the excluded
 * ones, plus the "To Budget" pool. Knows nothing about the flow that opened it —
 * `role` says which side of the transfer the pick lands on (which is all the
 * filtering depends on) and the caller brings its own `title`. Same sheet
 * language as the overspent list (root ScrollView — plain flex containers
 * collapse inside a formSheet with custom detents — left-aligned title, swipe to
 * dismiss) but with HeroUI ListGroup rows. Returns the selection through
 * `budgetUIStore.setPickedCategory`, consumed by the calling screen.
 */
export function CategoryPickerScreen() {
  const { t } = useTranslation("budget");
  const router = useRouter();
  const { excludeIds, role, title } = useLocalSearchParams<{
    /** Comma-separated category ids to leave out (already picked, or the target). */
    excludeIds: string;
    role: PickerRole;
    title: string;
  }>();
  /** Whether the picked category has to fund the transfer (needs a balance). */
  const picksFunder = role !== "receiver";
  const month = useBudgetUIStore((s) => s.month);
  const setPickedCategory = useBudgetUIStore((s) => s.setPickedCategory);
  const { categories, groups } = useCategories();
  const sheet = sheetForMonth(month);
  const toBudget = useSheetValueNumber(sheet, envelopeBudget.toBudget);
  const ssVersion = useSpreadsheetVersionWhere(
    useMemo(() => makeCategoryCellMatcher(sheet), [sheet]),
  );

  const [query, setQuery] = useState("");
  // Fixed header (title + search) height, measured so the list starts below it.
  const [headerHeight, setHeaderHeight] = useState(120);

  const excludeSet = useMemo(
    () => new Set((excludeIds?.split(",") ?? []).filter(Boolean)),
    [excludeIds],
  );

  const grouped = useMemo<PickableGroup[]>(() => {
    const ss = getSpreadsheet();
    const needle = query.trim().toLowerCase();
    return groups
      .filter((g) => !g.is_income)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .map((g) => ({
        id: g.id,
        name: g.name,
        categories: categories
          .filter((c) => c.cat_group === g.id && !excludeSet.has(c.id))
          .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
          .map((c) => ({
            id: c.id,
            name: c.name,
            balance: (ss.getValue(sheet, envelopeBudget.catBalance(c.id)) as number) ?? 0,
          }))
          .filter(
            (c) =>
              (!picksFunder || c.balance > 0) &&
              (needle === "" || c.name.toLowerCase().includes(needle)),
          ),
      }))
      .filter((g) => g.categories.length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories, groups, excludeSet, sheet, query, ssVersion, picksFunder]);

  // To Budget can always receive money back; it can only fund when it has some.
  const showToBudget =
    (picksFunder ? toBudget > 0 : true) && !excludeSet.has(TO_BUDGET_ID) && query.trim() === "";

  const select = (catId: string, catName: string, balance: number) => {
    setPickedCategory({ catId, catName, balance });
    router.back();
  };

  return (
    <>
      <ScrollView
        className="flex-1 bg-background"
        contentContainerClassName="px-4 pb-10"
        contentContainerStyle={{ paddingTop: headerHeight }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {showToBudget && (
          <ListGroup className="mb-3 overflow-hidden">
            <ListGroup.Item onPress={() => select(TO_BUDGET_ID, t("readyToAssignLabel"), toBudget)}>
              <ListGroup.ItemContent>
                <ListGroup.ItemTitle className="font-semibold">
                  {t("readyToAssignLabel")}
                </ListGroup.ItemTitle>
              </ListGroup.ItemContent>
              <ListGroup.ItemSuffix>
                <Money cents={toBudget} className="text-sm" />
              </ListGroup.ItemSuffix>
            </ListGroup.Item>
          </ListGroup>
        )}

        {grouped.map((group) => (
          <View key={group.id} className="mb-3">
            <Typography className="mb-1 ml-2 text-xs font-semibold uppercase text-muted">
              {group.name}
            </Typography>
            <ListGroup className="overflow-hidden">
              {group.categories.map((c, i) => (
                <Fragment key={c.id}>
                  {i > 0 ? <Separator className="mx-4" /> : null}
                  <ListGroup.Item onPress={() => select(c.id, c.name, c.balance)}>
                    <ListGroup.ItemContent>
                      <ListGroup.ItemTitle>{c.name}</ListGroup.ItemTitle>
                    </ListGroup.ItemContent>
                    <ListGroup.ItemSuffix>
                      <Money cents={c.balance} className="text-sm" />
                    </ListGroup.ItemSuffix>
                  </ListGroup.Item>
                </Fragment>
              ))}
            </ListGroup>
          </View>
        ))}

        {grouped.length === 0 && !showToBudget ? (
          <Typography className="py-6 text-center text-base text-muted">
            {t(picksFunder ? "noCategoriesWithBalance" : "noCategories")}
          </Typography>
        ) : null}
      </ScrollView>

      {/* Fixed header (title + search): an opaque absolute overlay the list
          scrolls behind; the ScrollView reserves its measured height. */}
      <View
        className="absolute inset-x-0 top-0 z-10 bg-background px-4 pb-3 pt-5"
        onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}
      >
        <Typography className="pb-3 text-lg font-semibold text-foreground">{title}</Typography>
        <SearchField value={query} onChange={setQuery}>
          <SearchField.Group>
            <SearchField.SearchIcon />
            <SearchField.Input placeholder={t("searchCategories")} />
            <SearchField.ClearButton />
          </SearchField.Group>
        </SearchField>
      </View>
    </>
  );
}
