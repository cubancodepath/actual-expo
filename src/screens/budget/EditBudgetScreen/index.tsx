import { useState } from "react";
import { View } from "react-native";
import { ListGroup, Typography } from "heroui-native";
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
import { useFeatureFlag } from "@/hooks/useFeatureFlag";
import { AmountKeyboard } from "@/ui/amount-keyboard";
import { usePlanTarget, useSpendingAverage } from "./hooks/usePlanCost";
import { useIncomeEditor } from "./hooks/useIncomeEditor";
import { useSurfaceLevel } from "@/ui/surface-level";

/**
 * Plan editor: the whole set of groups and categories on one screen, for
 * restructuring rather than budgeting. Built on the move-money
 * {@link EnvelopeSheet} — accent hero (this screen's figure tracks no good/bad
 * state; the card below it carries the verdict), a summary card pinned in its
 * curve, and the group list scrolling underneath it.
 *
 * The hero asks what a month costs and reads it from whichever source the file
 * actually has (see {@link usePlanTarget} / {@link useSpendingAverage}); the
 * card answers whether the user can pay for it. Which source is on screen is
 * spelled out in the caption, because the two are not interchangeable.
 *
 * The overlays hang off it, each keyed by its own piece of state so the target
 * and the open/closed state are always the same value: create a category or a
 * group, one group's or category's details, and the delete confirmation. Every
 * action lives here rather than in the sheets — deleting needs the dialog and
 * sometimes the transfer picker, and nesting overlays is asking for trouble.
 */
export function EditBudgetScreen() {
  const { itemVariant } = useSurfaceLevel();
  const { t } = useTranslation("budget");
  const insets = useSafeAreaInsets();
  const { sections, hiddenCount, isLoading } = useBudgetSections();
  // This screen is structural and has no month picker, but the goal figures on
  // its rows are per-month. It borrows the month the user came in on, which is
  // already inside the spreadsheet's built range.
  const { month } = useBudgetMonth();
  const sheet = sheetForMonth(month);
  const router = useRouter();

  // The keypad lives at screen level, not in the card that draws the field: the
  // body has to pad itself around it and dismiss on a tap, and neither is the
  // card's to know about.
  const incomeEditor = useIncomeEditor();
  const [padHeight, setPadHeight] = useState(0);

  const [newItem, setNewItem] = useState<NewItemIntent | null>(null);
  const [details, setDetails] = useState<BudgetSection | null>(null);
  const [categoryDetails, setCategoryDetails] = useState<BudgetSectionCategory | null>(null);

  // Both deletes run the same flow — transfer check, dialog, picker when a
  // destination is needed. A group is N category deletes, so it needs one just
  // as much. See useDeleteCategory.
  const { requestDelete } = useDeleteCategory();
  const { requestDeleteGroup } = useDeleteCategoryGroup();

  // Goal templates are off by default, so the plan figure exists for a minority.
  // When it does it leads — it responds to edits, which the average never will;
  // otherwise the average takes the hero.
  const goalsEnabled = useFeatureFlag("goalTemplatesEnabled");
  const plan = usePlanTarget(month);
  const spending = useSpendingAverage(month);

  const heroCents = goalsEnabled ? plan.cents : spending.cents;

  // Only what the figure can't say for itself. The plan says it all — it's the
  // sum of what's on the screen below it. The average doesn't: nothing about the
  // number reveals that it's a window over past months rather than this one's
  // total, so that one gets a line.
  const heroCaption = goalsEnabled
    ? null
    : spending.months > 0
      ? t("planCaptionSpending", { count: spending.months })
      : t("planCaptionNoHistory");

  function openGoalEditor(category: BudgetSectionCategory) {
    setCategoryDetails(null);
    router.push({
      pathname: "/(auth)/budget/goal",
      params: { categoryId: category.id },
    });
  }

  return (
    <AmountKeyboard
      isOpen={incomeEditor.isEditing}
      onOpenChange={incomeEditor.onOpenChange}
      value={incomeEditor.value}
      onValueChange={incomeEditor.setValue}
    >
      <EnvelopeSheet tone="accent" presentation="push">
        <EnvelopeSheet.Backdrop />

        <EnvelopeSheet.Body
          contentContainerStyle={{
            // There is no system keyboard to avoid, so nothing pads this for us:
            // while the pad is up it covers the bottom of the list, and without
            // its height added here those last groups can't be scrolled to.
            paddingBottom: insets.bottom + 32 + (incomeEditor.isEditing ? padHeight : 0),
          }}
        >
          {/* Capture-phase dismiss: a tap in the list closes the pad and still
              reaches the row it landed on, so nothing costs two taps. The income
              field is outside this — it's the one thing that must not dismiss. */}
          <AmountKeyboard.DismissArea className="gap-2 px-4">
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

            {/* Reads as one more group, because that's what it replaced. It is
              also the only way back for a hidden group, which no other screen
              renders at all. */}
            {!isLoading && hiddenCount > 0 ? (
              <View>
                <View className="px-1 pb-1 pt-4">
                  <Typography className="text-sm font-semibold text-foreground">
                    {t("hiddenSection")}
                  </Typography>
                </View>
                <ListGroup variant={itemVariant} className="overflow-hidden rounded-2xl">
                  <ListGroup.Item
                    onPress={() =>
                      router.push({
                        pathname: "/(auth)/budget/hidden-categories",
                      })
                    }
                  >
                    <ListGroup.ItemContent>
                      <ListGroup.ItemTitle>
                        {t("nHiddenCategories", { count: hiddenCount })}
                      </ListGroup.ItemTitle>
                    </ListGroup.ItemContent>
                  </ListGroup.Item>
                </ListGroup>
              </View>
            ) : null}
          </AmountKeyboard.DismissArea>
        </EnvelopeSheet.Body>

        <EnvelopeSheet.Pinned>
          <PlanSummaryCard costCents={heroCents} />
        </EnvelopeSheet.Pinned>

        {/* The figure leads and the question sits under it: the number is what the
          eye lands on, and the question reads as its label rather than as a
          heading the number happens to follow. The caption then qualifies both. */}
        <EnvelopeSheet.Hero>
          <EnvelopeSheet.Amount cents={heroCents} />
          <EnvelopeSheet.Title>{t("planHeroQuestion")}</EnvelopeSheet.Title>
          {heroCaption ? <EnvelopeSheet.Caption>{heroCaption}</EnvelopeSheet.Caption> : null}
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

      <AmountKeyboard.Portal>
        <AmountKeyboard.Panel onHeightChange={setPadHeight} />
      </AmountKeyboard.Portal>
    </AmountKeyboard>
  );
}
