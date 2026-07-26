import { useEffect, useState } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { EnvelopeSheet } from "@/screens/budget/components/EnvelopeSheet";
import { useRouter } from "expo-router";
import { useBudgetSections } from "@/screens/budget/hooks/useBudgetSections";
import type {
  BudgetSection,
  BudgetSectionCategory,
} from "@/screens/budget/hooks/useBudgetSections";
import {
  deleteCategory,
  deleteCategoryGroup,
  isCategoryTransferRequired,
  updateCategory,
  updateCategoryGroup,
} from "@/core/server/budget";
import { useBudgetUIStore } from "@/stores/budgetUIStore";
import { useUndo } from "@/lib/hooks/useUndo";
import { emitErrorEvent } from "@/lib/errors/ErrorChannel";
import { ConfirmDialog, type ConfirmRequest } from "@/ui/feedback/ConfirmDialog";
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
  const router = useRouter();
  const { showUndoNotification } = useUndo();
  const pickedCategory = useBudgetUIStore((s) => s.pickedCategory);
  const setPickedCategory = useBudgetUIStore((s) => s.setPickedCategory);

  const [newItem, setNewItem] = useState<NewItemIntent | null>(null);
  const [details, setDetails] = useState<BudgetSection | null>(null);
  const [categoryDetails, setCategoryDetails] = useState<BudgetSectionCategory | null>(null);
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);

  // ── Deleting a category: only ask for a transfer target when one is needed ──
  //
  // A category with transactions can't just vanish — they'd be left
  // uncategorised — so the picker hands back a destination through
  // `budgetUIStore.pickedCategory`. One without transactions skips all that.
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  useEffect(() => {
    if (!pendingDelete || !pickedCategory) return;
    const categoryId = pendingDelete;
    void (async () => {
      try {
        await deleteCategory(categoryId, pickedCategory.catId);
        showUndoNotification(t("categoryDeleted"));
      } catch (e) {
        emitErrorEvent(e);
      } finally {
        setPendingDelete(null);
        setPickedCategory(null);
      }
    })();
  }, [pendingDelete, pickedCategory, showUndoNotification, setPickedCategory, t]);

  function openGoalEditor(category: BudgetSectionCategory) {
    setCategoryDetails(null);
    router.push({ pathname: "/(auth)/budget/goal", params: { categoryId: category.id } });
  }

  function confirmDeleteCategory(category: BudgetSectionCategory) {
    setConfirm({
      title: t("deleteCategory"),
      description: t("deleteCategoryMessage", { name: category.name }),
      actions: [
        {
          label: t("delete"),
          isDestructive: true,
          onPress: () => {
            setConfirm(null);
            void (async () => {
              try {
                if (await isCategoryTransferRequired(category.id)) {
                  setPickedCategory(null);
                  setPendingDelete(category.id);
                  router.push({
                    pathname: "/(auth)/budget/delete-category-picker",
                    params: { excludeIds: category.id, moveCatId: category.id },
                  });
                  return;
                }
                await deleteCategory(category.id);
                showUndoNotification(t("categoryDeleted"));
              } catch (e) {
                emitErrorEvent(e);
              }
            })();
          },
        },
      ],
    });
  }

  function confirmDeleteGroup(group: BudgetSection) {
    const count = group.categories.length;
    setConfirm({
      title: t("deleteGroupTitle"),
      description:
        count > 0
          ? t("deleteGroupMessageWithCategories", {
              name: group.name,
              count,
              suffix: count === 1 ? "y" : "ies",
            })
          : t("deleteGroupMessageEmpty", { name: group.name }),
      actions: [
        {
          label: t("delete"),
          isDestructive: true,
          onPress: () => {
            void deleteCategoryGroup(group.id);
            setConfirm(null);
          },
        },
      ],
    });
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
          confirmDeleteGroup(group);
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
          confirmDeleteCategory(category);
        }}
        onEditGoals={openGoalEditor}
      />

      <ConfirmDialog request={confirm} onClose={() => setConfirm(null)} />
    </EnvelopeSheet>
  );
}
