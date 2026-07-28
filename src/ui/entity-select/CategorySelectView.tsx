import { Fragment, useState } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { Button, Checkbox, ListGroup, Separator, Typography, useThemeColor } from "heroui-native";
import { Check, Split } from "lucide-react-native";
import { Money } from "@/ui/Money";
import { PickerScreen } from "@/ui/PickerScreen";
import { useCategories } from "@/lib/hooks/useCategories";
import { useCategoryBalances } from "@/ui/hooks/useCategoryBalances";
import { useGroupedCategories } from "@/ui/hooks/useGroupedCategories";
import type { CategoryRef } from "./types";

interface CategorySelectViewProps {
  /** YYYYMMDD — month used for the balance column. */
  date: number;
  /** Currently assigned category: renders the check and seeds split multi-select. */
  selectedCategoryId?: string | null;
  /** Show the "Split transaction" entry + multi-select mode. */
  allowSplit?: boolean;
  /**
   * Single pick. `null` = the user tapped the already-selected category
   * (deselect). The view never navigates — the caller decides what happens.
   */
  onPick: (category: CategoryRef | null) => void;
  /** Split multi-select confirmed via the header "Next". Required with `allowSplit`. */
  onSplitNext?: (categoryIds: string[]) => void;
}

/**
 * THE category selector: full-screen searchable grouped picker with monthly
 * balances and an optional split multi-select mode. Form-agnostic and
 * self-contained on data (categories/groups/balances come from its own hooks) —
 * flows plug it in through `onPick`/`onSplitNext` and own all navigation and
 * persistence themselves.
 */
export function CategorySelectView({
  date,
  selectedCategoryId = null,
  allowSplit = false,
  onPick,
  onSplitNext,
}: CategorySelectViewProps) {
  const { t } = useTranslation("transactions");
  const accent = useThemeColor("accent");
  const muted = useThemeColor("muted");

  const { categories, groups } = useCategories();

  // Multi-select mode: tapping "Split" turns the left check into a checkbox so
  // several categories can be picked, then "Next" hands the ids to the caller.
  const [splitMode, setSplitMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const toggleId = (id: string) =>
    setSelectedIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  // Enter split mode, pre-seeding the current single category (one less tap).
  const enterSplit = () => {
    setSplitMode(true);
    setSelectedIds(selectedCategoryId ? [selectedCategoryId] : []);
  };

  const exitSplit = () => {
    setSplitMode(false);
    setSelectedIds([]);
  };

  // Category available balance for the transaction's month.
  const balances = useCategoryBalances(date);

  const [query, setQuery] = useState("");
  const grouped = useGroupedCategories(groups, categories, query);
  const searching = query.trim() !== "";

  const select = (category: CategoryRef) => {
    // Toggle semantics: tapping the selected category reports a deselect.
    onPick(category.id === selectedCategoryId ? null : category);
  };

  // Pure single-select pickers with no current selection (e.g. adding a split
  // line) render without the leading check column, like the original screen.
  const showPrefix = allowSplit || selectedCategoryId != null;

  return (
    <PickerScreen
      title={t("category")}
      query={query}
      onQueryChange={setQuery}
      searchPlaceholder={t("searchCategories")}
      onBack={splitMode ? exitSplit : undefined}
      headerActions={
        splitMode ? (
          <Button isDisabled={selectedIds.length < 1} onPress={() => onSplitNext?.(selectedIds)}>
            <Button.Label>{t("next")}</Button.Label>
          </Button>
        ) : undefined
      }
    >
      {allowSplit && !searching && !splitMode ? (
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
              const isSel = c.id === selectedCategoryId;
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
                    {showPrefix ? (
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
                    ) : null}
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
