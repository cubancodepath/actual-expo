import { memo } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { LinkButton, ListGroup, Typography } from "heroui-native";
import { envelopeBudget } from "@/core/server/spreadsheet/bindings";
import { parseGoalDef } from "@/core/server/budget/goal-template-parser";
import { describeTemplateShort } from "@/screens/budget/goals";
import { useSheetValueNumber } from "@/hooks/useSheetValue";
import { Money } from "@/ui/Money";
import type { BudgetSectionCategory } from "@/screens/budget/hooks/useBudgetSections";

/**
 * A category in the plan editor: the name, and on the right whatever its goals
 * amount to this month.
 *
 * The figure is the `goal-` cell, the same one `BudgetCategoryRow` reads to
 * colour its chip — already built for the month and already warm, so this costs
 * one per-cell subscription and no SQL. What it is NOT is "how much is still
 * needed": that means `computeGoalAllocations`, a whole-month batch whose
 * result depends on the order categories are funded in, so a per-row figure
 * computed in isolation wouldn't match what applying templates actually does.
 *
 * Its own component, memoised, so the subscription lives with the row that
 * needs it instead of re-rendering the whole group on every cell change.
 */
export const PlanCategoryRow = memo(function PlanCategoryRow({
  category,
  sheet,
  goalEditorEnabled,
  onPress,
  onAddGoal,
}: {
  category: BudgetSectionCategory;
  /** The month's sheet name, resolved once by the screen. */
  sheet: string;
  onPress: () => void;
  onAddGoal: () => void;
  goalEditorEnabled: boolean;
}) {
  const { t, i18n } = useTranslation("budget");
  const goal = useSheetValueNumber(sheet, envelopeBudget.catGoal(category.id));

  const templates = parseGoalDef(category.goal_def);
  // Income categories don't take templates, so they get no suffix at all —
  // neither a figure nor the shortcut.
  const showsGoals = goalEditorEnabled && !category.is_income;

  return (
    <ListGroup.Item onPress={onPress}>
      <ListGroup.ItemContent>
        <ListGroup.ItemTitle numberOfLines={1}>{category.name}</ListGroup.ItemTitle>
      </ListGroup.ItemContent>
      {showsGoals ? (
        <ListGroup.ItemSuffix>
          {templates.length === 0 ? (
            <LinkButton size="sm" onPress={onAddGoal}>
              <LinkButton.Label className="text-accent">{t("addGoal")}</LinkButton.Label>
            </LinkButton>
          ) : (
            <View className="items-end">
              {/* No figure when the cell reads 0: `inferGoalFromDef` only covers
                  goal/simple/by, so a percentage template that has never been
                  applied has nothing to show — and a $0.00 there would be a
                  lie, not an absence. The caption alone still says what it
                  does. */}
              {goal > 0 ? <Money cents={goal} tone="plain" /> : null}
              <Typography className="text-xs text-muted" numberOfLines={1}>
                {templates.length === 1
                  ? describeTemplateShort(templates[0], t, i18n.language)
                  : t("nGoals", { count: templates.length })}
              </Typography>
            </View>
          )}
        </ListGroup.ItemSuffix>
      ) : null}
    </ListGroup.Item>
  );
});
