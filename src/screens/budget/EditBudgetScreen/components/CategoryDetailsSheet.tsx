import { Fragment } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { Button, ListGroup, Separator, useThemeColor } from "heroui-native";
import { Eye, EyeOff, Target, Trash2 } from "lucide-react-native";
import { NameSheet } from "@/screens/budget/components/NameSheet";
import { parseGoalDef } from "@/core/server/budget/goal-template-parser";
import { describeTemplate } from "@/screens/budget/goals";
import { useFeatureFlag } from "@/hooks/useFeatureFlag";
import type { BudgetSectionCategory } from "@/screens/budget/hooks/useBudgetSections";
import { useSurfaceLevel } from "@/ui/surface-level";

/**
 * The category's saved goals in plain language, with a way into the editor.
 *
 * Unlike `CategoryDetailsScreen`, which describes only the first template, this
 * lists all of them — a category can carry several and the point of the card is
 * to see what it does. Built straight from `goal_def` rather than reusing the
 * goal stack's `GoalListRow`, which needs an `AutomationEntry` only that stack
 * produces.
 */
function GoalCard({
  goalDef,
  canEdit,
  onEditGoals,
}: {
  goalDef: string | null;
  /** The editor sits behind its own flag — without it the goals are read-only. */
  canEdit: boolean;
  onEditGoals: () => void;
}) {
  // The card itself is the `item`; the list nested inside it drops another rung.
  const { item, nestedVariant } = useSurfaceLevel();
  const { t, i18n } = useTranslation("budget");
  const [muted, accentForeground] = useThemeColor(["muted", "accent-foreground"]);

  const templates = parseGoalDef(goalDef);

  if (templates.length === 0) {
    if (!canEdit) return null;
    return (
      <Button variant="primary" onPress={onEditGoals}>
        <Target size={18} color={accentForeground} />
        <Button.Label>{t("addGoal")}</Button.Label>
      </Button>
    );
  }

  return (
    <View className={`gap-3 p-4 rounded-2xl shadow-xs ${item}`}>
      <ListGroup variant={nestedVariant} className="overflow-hidden rounded-2xl shadow-none">
        {templates.map((tmpl, i) => (
          <Fragment key={i}>
            {i > 0 ? <Separator className="mx-4" /> : null}
            <ListGroup.Item>
              <ListGroup.ItemPrefix>
                <Target size={18} color={muted} />
              </ListGroup.ItemPrefix>
              <ListGroup.ItemContent>
                <ListGroup.ItemTitle>
                  {describeTemplate(tmpl, t, i18n.language)}
                </ListGroup.ItemTitle>
              </ListGroup.ItemContent>
            </ListGroup.Item>
          </Fragment>
        ))}
      </ListGroup>
      {canEdit ? (
        <Button variant="primary" onPress={onEditGoals}>
          <Button.Label>{t("editGoal")}</Button.Label>
        </Button>
      ) : null}
    </View>
  );
}

/**
 * Per-category details: rename, goals, hide, delete — the twin of
 * `GroupDetailsSheet`, and structural like the rest of the plan editor. The
 * month's balances live in `CategoryDetailsScreen`, reached from the budget
 * table; this one deliberately has none.
 *
 * No `submitLabel`, so the name saves on blur and on dismiss. Every action is
 * handed back up: the screen owns the confirmation dialog and the transfer
 * picker, and nesting one overlay inside another is asking for trouble.
 */
export function CategoryDetailsSheet({
  category,
  onRename,
  onToggleHidden,
  onDelete,
  onEditGoals,
  onClose,
}: {
  category: BudgetSectionCategory | null;
  onRename: (category: BudgetSectionCategory, name: string) => Promise<void> | void;
  onToggleHidden: (category: BudgetSectionCategory) => void;
  onDelete: (category: BudgetSectionCategory) => void;
  onEditGoals: (category: BudgetSectionCategory) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation("budget");
  const [accent, dangerForeground] = useThemeColor(["accent", "danger-foreground"]);

  // Two flags, like CategoryDetailsScreen: the parent decides whether goals are
  // shown at all, the child whether they can be edited — the goal route
  // redirects when the child is off, so a button gated only by the parent would
  // lead nowhere. Income categories don't take goals.
  const goalsEnabled = useFeatureFlag("goalTemplatesEnabled");
  const goalEditorEnabled = useFeatureFlag("goalTemplatesUIEnabled");
  const showGoals = goalsEnabled && category != null && !category.is_income;

  return (
    <NameSheet
      target={category}
      title={t("details")}
      label={t("categoryNameLabel")}
      initialValue={category?.name ?? ""}
      onSave={async (name) => {
        if (category) await onRename(category, name);
      }}
      onClose={onClose}
    >
      {showGoals ? (
        <GoalCard
          goalDef={category.goal_def}
          canEdit={goalEditorEnabled}
          onEditGoals={() => onEditGoals(category)}
        />
      ) : null}

      <View className="flex-row gap-3">
        <Button
          variant="secondary"
          className="flex-1"
          onPress={() => category && onToggleHidden(category)}
        >
          {category?.hidden ? (
            <Eye size={18} color={accent} />
          ) : (
            <EyeOff size={18} color={accent} />
          )}
          <Button.Label>{category?.hidden ? t("showCategory") : t("hide")}</Button.Label>
        </Button>
        <Button variant="danger" className="flex-1" onPress={() => category && onDelete(category)}>
          <Trash2 size={18} color={dangerForeground} />
          <Button.Label>{t("delete")}</Button.Label>
        </Button>
      </View>
    </NameSheet>
  );
}
