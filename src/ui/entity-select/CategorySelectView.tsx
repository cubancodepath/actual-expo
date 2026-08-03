import { useMemo } from "react";
import { View } from "react-native";
import Animated, { FadeIn, FadeOut, LinearTransition } from "react-native-reanimated";
import { useTranslation } from "react-i18next";
import { Checkbox, useThemeColor } from "heroui-native";
import { Split } from "lucide-react-native";
import type { HeaderAction } from "@/ui/header-actions/types";
import { NativePickerScreen } from "@/ui/NativePickerScreen";
import { PickerSection } from "@/ui/picker/PickerSection";
import { PickerBalance, PickerCheck, PickerRow } from "@/ui/picker/PickerRow";
import { PickerActionRow, PickerEmptyState } from "@/ui/picker/PickerActionRow";
import { usePickerSearch } from "@/ui/picker/usePickerSearch";
import { useCategories } from "@/lib/hooks/useCategories";
import { useCategoryBalances } from "@/ui/hooks/useCategoryBalances";
import { useCategoryPickerSections } from "@/ui/hooks/useCategoryPickerSections";
import { useSplitSelection } from "./useSplitSelection";
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
   * (deselect), or chose the "no category" row. The view never navigates — the
   * caller decides what happens.
   */
  onPick: (category: CategoryRef | null) => void;
  /** Split multi-select confirmed via the header "Next". Required with `allowSplit`. */
  onSplitNext?: (categoryIds: string[]) => void;
  /** Adds a leading row that clears the category (assign flows). */
  showNoCategoryRow?: boolean;
}

// Entering/exiting the split mode swaps rows in and out; without these the list
// jumps. Named at module scope like SearchScreen's, the other screen whose own
// header changes shape in place.
const SPLIT_ROW_IN = FadeIn.duration(180);
const SPLIT_ROW_OUT = FadeOut.duration(120);
const LIST_LAYOUT = LinearTransition.duration(180);

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
  showNoCategoryRow = false,
}: CategorySelectViewProps) {
  const { t } = useTranslation("transactions");
  const { t: tc } = useTranslation("common");
  const accent = useThemeColor("accent");

  const { categories, groups } = useCategories();
  const categoryIds = useMemo(() => categories.map((c) => c.id), [categories]);
  const balances = useCategoryBalances(date, categoryIds);
  const { query, setQuery, q, searching } = usePickerSearch();
  const sections = useCategoryPickerSections(groups, categories, { q, balances });

  const { splitMode, selectedIds, toggleId, enterSplit, exitSplit } =
    useSplitSelection(selectedCategoryId);

  // Toggle semantics: tapping the selected category reports a deselect.
  const select = (category: CategoryRef) =>
    onPick(category.id === selectedCategoryId ? null : category);

  // Pure single-select pickers with no current selection (e.g. adding a split
  // line) render without the leading check column, like the original screen.
  const showPrefix = allowSplit || showNoCategoryRow || selectedCategoryId != null;

  // In split mode the back control cancels the mode instead of popping the
  // screen, so it reads as Cancel rather than the stack's chevron. Memoised:
  // expo-router re-runs setOptions on every options identity change.
  const cancelAction = useMemo<HeaderAction | undefined>(
    () => (splitMode ? { label: tc("cancel"), onPress: exitSplit } : undefined),
    [splitMode, tc, exitSplit],
  );

  const nextAction = useMemo<HeaderAction | undefined>(
    () =>
      splitMode
        ? {
            label: t("next"),
            emphasis: "done",
            // Without this the filled capsule iOS 26 draws for a "done" action
            // comes out system blue.
            tintColor: accent,
            disabled: selectedIds.length < 1,
            onPress: () => onSplitNext?.(selectedIds),
          }
        : undefined,
    [splitMode, t, accent, selectedIds, onSplitNext],
  );

  return (
    <NativePickerScreen
      title={t("category")}
      query={query}
      onQueryChange={setQuery}
      searchPlaceholder={t("searchCategories")}
      // Categories keep the search within thumb reach at the bottom; payees
      // keep theirs stacked at the top.
      searchPlacement="integrated"
      headerLeft={cancelAction}
      headerRight={nextAction}
    >
      {/* Entering split mode unmounts these rows. Fading them out, and letting
          the sections below slide up into the gap, keeps the whole mode switch
          from happening in one hard frame. (The native chevron→Cancel swap is
          UIKit's own and can't be animated from here.) */}
      {showNoCategoryRow && !splitMode ? (
        <Animated.View entering={SPLIT_ROW_IN} exiting={SPLIT_ROW_OUT}>
          <PickerActionRow
            title={t("noCategoryOption")}
            accent={false}
            prefix={<PickerCheck isSelected={!selectedCategoryId} />}
            onPress={() => onPick(null)}
          />
        </Animated.View>
      ) : null}

      {allowSplit && !searching && !splitMode ? (
        <Animated.View entering={SPLIT_ROW_IN} exiting={SPLIT_ROW_OUT}>
          <PickerActionRow
            title={t("splitTransaction")}
            prefix={
              <View className="rotate-90">
                <Split size={18} color={accent} />
              </View>
            }
            onPress={enterSplit}
          />
        </Animated.View>
      ) : null}

      {sections.map(({ group, items }) => (
        <Animated.View key={group.id} layout={LIST_LAYOUT}>
          <PickerSection title={group.name}>
            {items.map((c, i) => (
              <PickerRow
                key={c.id}
                index={i}
                title={c.name}
                onPress={() => (splitMode ? toggleId(c.id) : select({ id: c.id, name: c.name }))}
                prefix={
                  showPrefix ? (
                    <PickerCheck isSelected={c.id === selectedCategoryId}>
                      {splitMode ? (
                        <View pointerEvents="none">
                          <Checkbox
                            isSelected={selectedIds.includes(c.id)}
                            className="rounded-full"
                          >
                            <Checkbox.Indicator
                              className="rounded-full"
                              animation={{ borderRadius: { value: [999, 999] } }}
                            />
                          </Checkbox>
                        </View>
                      ) : undefined}
                    </PickerCheck>
                  ) : undefined
                }
                suffix={c.balance !== undefined ? <PickerBalance cents={c.balance} /> : undefined}
              />
            ))}
          </PickerSection>
        </Animated.View>
      ))}

      {sections.length === 0 ? (
        <PickerEmptyState message={searching ? t("noResults") : t("uncategorized")} />
      ) : null}
    </NativePickerScreen>
  );
}
