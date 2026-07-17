import { Fragment, useMemo, useState } from "react";
import { Alert, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { ListGroup, Separator, Typography } from "heroui-native";
import { useBudgetUIStore } from "@/stores/budgetUIStore";
import { useCategories } from "@/hooks/useCategories";
import { sheetForMonth, envelopeBudget } from "@/core/domain/spreadsheet/bindings";
import { getSpreadsheet } from "@/core/domain/spreadsheet/instance";
import { Money } from "@/ui/Money";
import { PickerScreen } from "@/ui/PickerScreen";

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

export default function DeleteCategoryPickerScreen() {
  const { t } = useTranslation("budget");
  const router = useRouter();
  const { excludeIds, moveCatId } = useLocalSearchParams<{
    excludeIds: string;
    moveCatId: string;
  }>();
  const month = useBudgetUIStore((s) => s.month);
  const setCoverTarget = useBudgetUIStore((s) => s.setCoverTarget);
  const { categories, groups } = useCategories();
  const sheet = sheetForMonth(month);
  const [query, setQuery] = useState("");

  const excludeSet = useMemo(
    () => new Set([...(excludeIds?.split(",") ?? []), moveCatId].filter(Boolean)),
    [excludeIds, moveCatId],
  );

  const grouped = useMemo<PickableGroup[]>(() => {
    const ss = getSpreadsheet();
    const needle = query.trim().toLowerCase();
    const expenseGroups = groups
      .filter((g) => !g.is_income)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

    return expenseGroups
      .map((g) => {
        const groupCats = categories
          .filter((c) => c.cat_group === g.id && !excludeSet.has(c.id))
          .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

        return {
          id: g.id,
          name: g.name,
          categories: groupCats
            .map((c) => ({
              id: c.id,
              name: c.name,
              balance: (ss.getValue(sheet, envelopeBudget.catBalance(c.id)) as number) ?? 0,
            }))
            .filter((c) => needle === "" || c.name.toLowerCase().includes(needle)),
        };
      })
      .filter((g) => g.categories.length > 0);
  }, [categories, groups, excludeSet, sheet, query]);

  const select = (cat: PickableCategory) => {
    Alert.alert(t("confirmDeleteTitle"), t("confirmDeleteMessage", { name: cat.name }), [
      { text: t("cancel"), style: "cancel" },
      {
        text: t("delete"),
        style: "destructive",
        onPress: () => {
          setCoverTarget({ catId: cat.id, catName: cat.name, balance: cat.balance });
          router.back();
        },
      },
    ]);
  };

  return (
    <PickerScreen
      title={t("moveTransactionsTo")}
      query={query}
      onQueryChange={setQuery}
      searchPlaceholder={t("searchCategories")}
    >
      {grouped.map((group) => (
        <View key={group.id} className="mb-3">
          <Typography className="mb-1 ml-2 text-xs font-semibold uppercase text-muted">
            {group.name}
          </Typography>
          <ListGroup>
            {group.categories.map((c, i) => (
              <Fragment key={c.id}>
                {i > 0 ? <Separator className="mx-4" /> : null}
                <ListGroup.Item onPress={() => select(c)}>
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

      {grouped.length === 0 ? (
        <Typography className="py-6 text-center text-base text-muted">
          {t("noCategoriesWithBalance")}
        </Typography>
      ) : null}
    </PickerScreen>
  );
}
