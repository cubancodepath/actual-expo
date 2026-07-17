import { Fragment, useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Button, ListGroup, Separator, Typography, useThemeColor } from "heroui-native";
import { Check } from "lucide-react-native";
import { Money } from "@/ui/Money";
import { PickerScreen } from "@/ui/PickerScreen";
import { useCategories } from "@/hooks/useCategories";
import { getCategoryBalancesForMonth } from "@/core/domain/budgets";
import { usePickerStore } from "@/stores/pickerStore";
import { currentMonth } from "@/lib/date";

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
 * Category picker for an EXISTING transaction (bulk-edit/assign flows on the
 * account and spending screens) — provider-independent, unlike
 * `CategoryPickerScreen` which only works inside `TransactionFormProvider`.
 * Preserves the legacy `transaction/category-picker` contract: writes the
 * pick to `pickerStore.setCategory` and pops the screen (callers read
 * `usePickerStore().selectedCategory` after the route resolves).
 */
export function CategoryAssignPickerScreen() {
  const { t } = useTranslation("transactions");
  const router = useRouter();
  const accent = useThemeColor("accent");
  const { month, selectedId, amount, payeeId, payeeName, transactionId, hideSplit } =
    useLocalSearchParams<{
      month?: string;
      selectedId?: string;
      amount?: string;
      payeeId?: string;
      payeeName?: string;
      transactionId?: string;
      hideSplit?: string;
    }>();

  const setCategory = usePickerStore((s) => s.setCategory);
  const { categories, groups } = useCategories();
  const [balances, setBalances] = useState<Map<string, number>>(new Map());
  const [query, setQuery] = useState("");

  const displayMonth = month || currentMonth();

  useEffect(() => {
    let alive = true;
    getCategoryBalancesForMonth(displayMonth)
      .then((m) => alive && setBalances(m))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [displayMonth]);

  const grouped = useMemo<PickableGroup[]>(() => {
    const needle = query.trim().toLowerCase();
    return groups
      .filter((g) => !g.hidden && !g.tombstone)
      .sort((a, b) => {
        if (a.is_income !== b.is_income) return a.is_income ? 1 : -1;
        return (a.sort_order ?? 0) - (b.sort_order ?? 0);
      })
      .map((g) => ({
        id: g.id,
        name: g.name,
        categories: categories
          .filter((c) => c.cat_group === g.id && !c.hidden && !c.tombstone)
          .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
          .map((c) => ({ id: c.id, name: c.name, balance: balances.get(c.id) ?? 0 }))
          .filter((c) => needle === "" || c.name.toLowerCase().includes(needle)),
      }))
      .filter((g) => g.categories.length > 0);
  }, [groups, categories, balances, query]);

  const select = (id: string | null, name: string) => {
    setCategory({ id, name });
    router.back();
  };

  const goSplit = () =>
    router.push({
      pathname: "./split",
      params: {
        amount: amount ?? "0",
        payeeId: payeeId ?? "",
        payeeName: payeeName ?? "",
        transactionId: transactionId ?? "",
        fromCategoryPicker: "1",
      },
    });

  const noneSelected = !selectedId;

  return (
    <PickerScreen
      title={t("category")}
      query={query}
      onQueryChange={setQuery}
      searchPlaceholder={t("searchCategories")}
      headerActions={
        hideSplit !== "1" ? (
          <Button onPress={goSplit}>
            <Button.Label>{t("split")}</Button.Label>
          </Button>
        ) : undefined
      }
    >
      <ListGroup className="mb-3">
        <ListGroup.Item onPress={() => select(null, "")}>
          <ListGroup.ItemPrefix>
            <View className="w-5 items-center justify-center">
              {noneSelected ? <Check size={18} color={accent} /> : null}
            </View>
          </ListGroup.ItemPrefix>
          <ListGroup.ItemContent>
            <ListGroup.ItemTitle>{t("noCategoryOption")}</ListGroup.ItemTitle>
          </ListGroup.ItemContent>
        </ListGroup.Item>
      </ListGroup>

      {grouped.map((group) => (
        <View key={group.id} className="mb-3">
          <Typography className="mb-1 ml-2 text-xs font-semibold uppercase text-muted">
            {group.name}
          </Typography>
          <ListGroup>
            {group.categories.map((c, i) => {
              const isSel = c.id === selectedId;
              return (
                <Fragment key={c.id}>
                  {i > 0 ? <Separator className="mx-4" /> : null}
                  <ListGroup.Item onPress={() => select(c.id, c.name)}>
                    <ListGroup.ItemPrefix>
                      <View className="w-5 items-center justify-center">
                        {isSel ? <Check size={18} color={accent} /> : null}
                      </View>
                    </ListGroup.ItemPrefix>
                    <ListGroup.ItemContent>
                      <ListGroup.ItemTitle>{c.name}</ListGroup.ItemTitle>
                    </ListGroup.ItemContent>
                    <ListGroup.ItemSuffix>
                      <Money cents={c.balance} className="text-sm" />
                    </ListGroup.ItemSuffix>
                  </ListGroup.Item>
                </Fragment>
              );
            })}
          </ListGroup>
        </View>
      ))}
    </PickerScreen>
  );
}
