import { Fragment, useState } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useSelector } from "@tanstack/react-store";
import { ListGroup, Separator, Typography, useThemeColor } from "heroui-native";
import { Money } from "@/ui/Money";
import { PickerScreen } from "@/screens/transactions/components/PickerScreen";
import { useCategoryBalances } from "@/screens/transactions/hooks/useCategoryBalances";
import { useGroupedCategories } from "@/screens/transactions/hooks/useGroupedCategories";
import { useTransactionForm } from "@/screens/transactions/NewTransactionScreen/context/TransactionFormProvider";

/**
 * Single-select category picker used to add one more category to an in-progress
 * split. Same grouped/searchable list as the main category screen, but tapping a
 * category hands it back to the split-amounts screen (via context) and closes —
 * it never touches the parent transaction's category.
 */
export function SplitAddCategoryScreen() {
  const { t } = useTranslation("transactions");
  const router = useRouter();
  const muted = useThemeColor("muted");

  const { form, categories, groups, setPendingSplitCategory } = useTransactionForm();
  const date = useSelector(form.store, (s) => s.values.date);

  // Category available balance for the transaction's month.
  const balances = useCategoryBalances(date);

  const [query, setQuery] = useState("");
  const grouped = useGroupedCategories(groups, categories, query);
  const searching = query.trim() !== "";

  const select = (category: { id: string; name: string }) => {
    setPendingSplitCategory({ id: category.id, name: category.name });
    router.back();
  };

  return (
    <PickerScreen
      title={t("category")}
      query={query}
      onQueryChange={setQuery}
      searchPlaceholder={t("searchCategories")}
    >
      {grouped.map(({ group, items }) => (
        <View key={group.id} className="mb-3">
          <Typography className="mb-1 ml-2 text-xs font-semibold uppercase text-muted">
            {group.name}
          </Typography>
          <ListGroup>
            {items.map((c, i) => {
              const bal = balances.get(c.id);
              return (
                <Fragment key={c.id}>
                  {i > 0 ? <Separator className="mx-4" /> : null}
                  <ListGroup.Item onPress={() => select({ id: c.id, name: c.name })}>
                    <ListGroup.ItemContent>
                      <ListGroup.ItemTitle>{c.name}</ListGroup.ItemTitle>
                    </ListGroup.ItemContent>
                    <ListGroup.ItemSuffix>
                      {bal !== undefined ? <Money cents={bal} className="text-sm" /> : <View />}
                    </ListGroup.ItemSuffix>
                  </ListGroup.Item>
                </Fragment>
              );
            })}
          </ListGroup>
        </View>
      ))}
      {grouped.length === 0 ? (
        <Typography className="py-6 text-center text-base" style={{ color: muted }}>
          {searching ? t("noResults") : t("uncategorized")}
        </Typography>
      ) : null}
    </PickerScreen>
  );
}
