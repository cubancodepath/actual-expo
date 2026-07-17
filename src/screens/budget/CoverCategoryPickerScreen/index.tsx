import { Fragment, useMemo, useState } from "react";
import { ScrollView, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { ListGroup, SearchField, Separator, Typography } from "heroui-native";
import { useBudgetUIStore } from "@/stores/budgetUIStore";
import { useCategories } from "@/screens/budget/hooks/useCategories";
import { useSheetValueNumber, useSpreadsheetVersion } from "@/hooks/useSheetValue";
import { envelopeBudget, sheetForMonth } from "@/core/domain/spreadsheet/bindings";
import { getSpreadsheet } from "@/core/domain/spreadsheet/instance";
import { TO_BUDGET_ID } from "@/screens/budget/constants";
import { Money } from "@/ui/Money";

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
 * Funding-source picker for the cover-overspent flow: expense categories with a
 * positive balance (minus already-picked ones), plus the "To Budget" pool when
 * it has money. Same sheet language as the overspent list (root ScrollView —
 * plain flex containers collapse inside a formSheet with custom detents —
 * left-aligned title, swipe to dismiss) but with HeroUI ListGroup rows. Returns
 * the selection through `budgetUIStore.setCoverTarget`, consumed by cover-source.
 */
export function CoverCategoryPickerScreen() {
  const { t } = useTranslation("budget");
  const router = useRouter();
  const { excludeIds, overspentCatId } = useLocalSearchParams<{
    excludeIds: string;
    overspentCatId: string;
  }>();
  const month = useBudgetUIStore((s) => s.month);
  const setCoverTarget = useBudgetUIStore((s) => s.setCoverTarget);
  const { categories, groups } = useCategories();
  const sheet = sheetForMonth(month);
  const toBudget = useSheetValueNumber(sheet, envelopeBudget.toBudget);
  const ssVersion = useSpreadsheetVersion();

  const [query, setQuery] = useState("");
  // Fixed header (title + search) height, measured so the list starts below it.
  const [headerHeight, setHeaderHeight] = useState(120);

  const excludeSet = useMemo(
    () => new Set([...(excludeIds?.split(",") ?? []), overspentCatId].filter(Boolean)),
    [excludeIds, overspentCatId],
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
          .filter((c) => c.balance > 0 && (needle === "" || c.name.toLowerCase().includes(needle))),
      }))
      .filter((g) => g.categories.length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories, groups, excludeSet, sheet, query, ssVersion]);

  const showToBudget = toBudget > 0 && !excludeSet.has(TO_BUDGET_ID) && query.trim() === "";

  const select = (catId: string, catName: string, balance: number) => {
    setCoverTarget({ catId, catName, balance });
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
            {t("noCategoriesWithBalance")}
          </Typography>
        ) : null}
      </ScrollView>

      {/* Fixed header (title + search): an opaque absolute overlay the list
          scrolls behind; the ScrollView reserves its measured height. */}
      <View
        className="absolute inset-x-0 top-0 z-10 bg-background px-4 pb-3 pt-5"
        onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}
      >
        <Typography className="pb-3 text-lg font-semibold text-foreground">
          {t("coverOverspendingFrom")}
        </Typography>
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
