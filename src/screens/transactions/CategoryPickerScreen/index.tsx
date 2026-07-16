import { Fragment, useState } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useSelector } from "@tanstack/react-store";
import { Button, Checkbox, ListGroup, Separator, Typography, useThemeColor } from "heroui-native";
import { Check, Split } from "lucide-react-native";
import { Money } from "@/ui/Money";
import { PickerScreen } from "@/ui/PickerScreen";
import { useCategoryBalances } from "@/screens/transactions/hooks/useCategoryBalances";
import { useGroupedCategories } from "@/screens/transactions/hooks/useGroupedCategories";
import { useTransactionForm } from "@/screens/transactions/NewTransactionScreen/context/TransactionFormProvider";

/** Full-screen searchable category picker (grouped) with a "split" entry point. */
export function CategoryPickerScreen() {
  const { t } = useTranslation("transactions");
  const router = useRouter();
  const accent = useThemeColor("accent");
  const muted = useThemeColor("muted");

  const { form, categories, groups, actions } = useTransactionForm();
  const categoryId = useSelector(form.store, (s) => s.values.categoryId);
  const date = useSelector(form.store, (s) => s.values.date);

  // Multi-select mode: tapping "Split" turns the left check into a checkbox so
  // several categories can be picked, then "Next" opens the split-amounts screen.
  // (An already-split transaction opens split-amounts directly, so this screen is
  // only ever reached in single-select mode.)
  const [splitMode, setSplitMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const toggleId = (id: string) =>
    setSelectedIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  // Enter split mode, pre-seeding the current single category (one less tap).
  const enterSplit = () => {
    setSplitMode(true);
    setSelectedIds(categoryId ? [categoryId] : []);
  };

  const exitSplit = () => {
    setSplitMode(false);
    setSelectedIds([]);
  };

  const goNext = () =>
    router.push({
      pathname: "/(auth)/transaction/split-amounts",
      params: { ids: selectedIds.join(",") },
    });

  // Category available balance for the transaction's month.
  const balances = useCategoryBalances(date);

  const [query, setQuery] = useState("");
  const grouped = useGroupedCategories(groups, categories, query);
  const searching = query.trim() !== "";

  const select = (category: { id: string; name: string }) => {
    // Toggle: tapping the selected category deselects it (and stays open);
    // tapping any other selects it and closes.
    if (category.id === categoryId) {
      actions.clearCategory();
    } else {
      actions.selectCategory(category);
      router.back();
    }
  };

  return (
    <PickerScreen
      title={t("category")}
      query={query}
      onQueryChange={setQuery}
      searchPlaceholder={t("searchCategories")}
      onBack={splitMode ? exitSplit : undefined}
      headerActions={
        splitMode ? (
          <Button isDisabled={selectedIds.length < 1} onPress={goNext}>
            <Button.Label>{t("next")}</Button.Label>
          </Button>
        ) : undefined
      }
    >
      {!searching && !splitMode ? (
        <ListGroup className="mb-3">
          <ListGroup.Item onPress={enterSplit}>
            <ListGroup.ItemPrefix>
              <View className="rotate-90">
                <Split size={18} color={accent} />
              </View>
            </ListGroup.ItemPrefix>
            <ListGroup.ItemContent>
              <ListGroup.ItemTitle className="text-accent">
                {t("splitTransaction")}
              </ListGroup.ItemTitle>
            </ListGroup.ItemContent>
          </ListGroup.Item>
        </ListGroup>
      ) : null}

      {grouped.map(({ group, items }) => (
        <View key={group.id} className="mb-3">
          <Typography className="mb-1 ml-2 text-xs font-semibold uppercase text-muted">
            {group.name}
          </Typography>
          <ListGroup>
            {items.map((c, i) => {
              const isSel = c.id === categoryId;
              const isChecked = selectedIds.includes(c.id);
              const bal = balances.get(c.id);
              return (
                <Fragment key={c.id}>
                  {i > 0 ? <Separator className="mx-4" /> : null}
                  <ListGroup.Item
                    onPress={() =>
                      splitMode ? toggleId(c.id) : select({ id: c.id, name: c.name })
                    }
                  >
                    <ListGroup.ItemPrefix>
                      <View className="w-5 items-center justify-center">
                        {splitMode ? (
                          <View pointerEvents="none">
                            <Checkbox isSelected={isChecked} className="rounded-full">
                              <Checkbox.Indicator
                                className="rounded-full"
                                animation={{
                                  borderRadius: { value: [999, 999] },
                                }}
                              />
                            </Checkbox>
                          </View>
                        ) : isSel ? (
                          <Check size={18} color={accent} />
                        ) : null}
                      </View>
                    </ListGroup.ItemPrefix>
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
