import { useState } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { EnvelopeSheet } from "@/screens/budget/components/EnvelopeSheet";
import { useRouter } from "expo-router";
import { useBudgetSections } from "@/screens/budget/hooks/useBudgetSections";
import { useBudgetMonth } from "@/screens/budget/hooks/useBudgetMonth";
import { sheetForMonth } from "@/core/server/spreadsheet/bindings";
import type {
  BudgetSection,
  BudgetSectionCategory,
} from "@/screens/budget/hooks/useBudgetSections";
import { updateCategory, updateCategoryGroup } from "@/core/server/budget";
import {
  useDeleteCategory,
  useDeleteCategoryGroup,
} from "@/screens/budget/hooks/useDeleteCategory";
import { ScreenHeader } from "@/ui/ScreenHeader";
import { EditPlanGroup } from "./components/EditPlanGroup";
import { CategoryDetailsSheet } from "./components/CategoryDetailsSheet";
import { GroupDetailsSheet } from "./components/GroupDetailsSheet";
import { NewItemSheet, type NewItemIntent } from "./components/NewItemSheet";
import { PlanActionsMenu } from "./components/PlanActionsMenu";
import { PlanSummaryCard } from "./components/PlanSummaryCard";

/** Placeholder until we settle what this screen's headline figure should be. */
const PLACEHOLDER_HERO_CENTS = 0;

/**
 * Plan editor: the whole set of groups and categories on one screen, for
 * restructuring rather than budgeting. Built on the move-money
 * {@link EnvelopeSheet} — accent hero (this screen's figure tracks no good/bad
 * state), a summary card pinned in its curve, and the group list scrolling
 * underneath it.
 *
 * The overlays hang off it, each keyed by its own piece of state so the target
 * and the open/closed state are always the same value: create a category or a
 * group, one group's or category's details, and the delete confirmation. Every
 * action lives here rather than in the sheets — deleting needs the dialog and
 * sometimes the transfer picker, and nesting overlays is asking for trouble.
 */
export function EditBudgetScreen() {
  const { t } = useTranslation("budget");
  const insets = useSafeAreaInsets();
  const { sections, isLoading } = useBudgetSections();
  // This screen is structural and has no month picker, but the goal figures on
  // its rows are per-month. It borrows the month the user came in on, which is
  // already inside the spreadsheet's built range.
  const { month } = useBudgetMonth();
  const sheet = sheetForMonth(month);
  const router = useRouter();

  const [newItem, setNewItem] = useState<NewItemIntent | null>(null);
  const [details, setDetails] = useState<BudgetSection | null>(null);
  const [categoryDetails, setCategoryDetails] = useState<BudgetSectionCategory | null>(null);

  // Both deletes run the same flow — transfer check, dialog, picker when a
  // destination is needed. A group is N category deletes, so it needs one just
  // as much. See useDeleteCategory.
  const { requestDelete } = useDeleteCategory();
  const { requestDeleteGroup } = useDeleteCategoryGroup();

  function openGoalEditor(category: BudgetSectionCategory) {
    setCategoryDetails(null);
    router.push({ pathname: "/(auth)/budget/goal", params: { categoryId: category.id } });
  }

  return (
    <EnvelopeSheet tone="accent" presentation="push">
      <EnvelopeSheet.Backdrop />

      <EnvelopeSheet.Body contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>
        <View className="gap-2 px-4">
          {!isLoading &&
            sections.map((section) => (
              <EditPlanGroup
                key={section.id}
                section={section}
                sheet={sheet}
                onAddCategory={() => setNewItem({ kind: "category", group: section })}
                onOpenDetails={() => setDetails(section)}
                onOpenCategory={setCategoryDetails}
                onAddGoal={openGoalEditor}
              />
            ))}
        </View>
      </EnvelopeSheet.Body>

      <EnvelopeSheet.Pinned>
        <PlanSummaryCard />
      </EnvelopeSheet.Pinned>

      <EnvelopeSheet.Hero>
        <EnvelopeSheet.Title>{t("editBudget")}</EnvelopeSheet.Title>
        <EnvelopeSheet.Amount cents={PLACEHOLDER_HERO_CENTS} />
      </EnvelopeSheet.Hero>

      <EnvelopeSheet.Close>
        <ScreenHeader.Back />
      </EnvelopeSheet.Close>

      <EnvelopeSheet.Actions>
        <PlanActionsMenu onNewGroup={() => setNewItem({ kind: "group" })} />
      </EnvelopeSheet.Actions>

      <NewItemSheet intent={newItem} onClose={() => setNewItem(null)} />

      {/* The three group actions live here, not in the sheet: delete needs the
          screen's confirmation dialog, and nesting overlays is asking for it. */}
      <GroupDetailsSheet
        group={details}
        onClose={() => setDetails(null)}
        onRename={(group, name) => updateCategoryGroup(group.id, { name })}
        onHide={(group) => {
          void updateCategoryGroup(group.id, { hidden: true });
          setDetails(null);
        }}
        onDelete={(group) => {
          setDetails(null);
          void requestDeleteGroup(group);
        }}
      />

      <CategoryDetailsSheet
        category={categoryDetails}
        onClose={() => setCategoryDetails(null)}
        onRename={(category, name) => updateCategory(category.id, { name })}
        onToggleHidden={(category) => {
          void updateCategory(category.id, { hidden: !category.hidden });
          setCategoryDetails(null);
        }}
        onDelete={(category) => {
          setCategoryDetails(null);
          void requestDelete(category);
        }}
        onEditGoals={openGoalEditor}
      />
    </EnvelopeSheet>
  );
}
