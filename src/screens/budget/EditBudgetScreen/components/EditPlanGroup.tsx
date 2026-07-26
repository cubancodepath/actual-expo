import { Fragment } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { Button, LinkButton, ListGroup, Separator, Typography, useThemeColor } from "heroui-native";
import { CirclePlus, EllipsisVertical } from "lucide-react-native";
import { HIDDEN_GROUP_ID } from "@/screens/budget/hooks/useBudgetSections";
import { parseGoalDef } from "@/core/server/budget/goal-template-parser";
import { useFeatureFlag } from "@/hooks/useFeatureFlag";
import type { BudgetSection } from "@/screens/budget/hooks/useBudgetSections";

/**
 * One group in the plan editor: a header row outside the card (name + actions)
 * over a card of its category names. Unlike the budget table's groups these
 * don't collapse — the whole point of this screen is seeing the plan at once.
 */
export function EditPlanGroup({
  section,
  onAddCategory,
  onOpenDetails,
  onOpenCategory,
  onAddGoal,
}: {
  section: BudgetSection;
  onAddCategory: () => void;
  onOpenDetails: () => void;
  onOpenCategory: (category: BudgetSection["categories"][number]) => void;
  onAddGoal: (category: BudgetSection["categories"][number]) => void;
}) {
  const { t } = useTranslation("budget");
  const foreground = useThemeColor("foreground");
  // Gates the editor itself, and cascades off with its parent
  // (`goalTemplatesEnabled`), so it's the only flag this shortcut needs.
  const goalEditorEnabled = useFeatureFlag("goalTemplatesUIEnabled");
  // The hidden bucket is synthetic, not a real group — there's nothing to add
  // a category to and no group to edit, so it gets the header without actions.
  const isSynthetic = section.id === HIDDEN_GROUP_ID;

  return (
    <View>
      <View className="flex-row items-center gap-1 px-1 pb-1 pt-4">
        <Typography className="flex-1 text-sm font-semibold text-foreground" numberOfLines={1}>
          {section.name}
        </Typography>
        {!isSynthetic && (
          <>
            <Button
              isIconOnly
              variant="ghost"
              size="sm"
              onPress={onAddCategory}
              accessibilityLabel={t("addGroupAccessibility", {
                name: section.name,
              })}
            >
              <CirclePlus size={18} color={foreground} />
            </Button>
            <Button
              isIconOnly
              variant="ghost"
              size="sm"
              onPress={onOpenDetails}
              accessibilityLabel={t("editGroupAccessibility", {
                name: section.name,
              })}
            >
              <EllipsisVertical size={18} color={foreground} />
            </Button>
          </>
        )}
      </View>

      {section.categories.length > 0 && (
        <ListGroup className="overflow-hidden rounded-2xl">
          {section.categories.map((cat, i) => (
            <Fragment key={cat.id}>
              {i > 0 ? <Separator className="mx-4" /> : null}
              <ListGroup.Item onPress={() => onOpenCategory(cat)}>
                <ListGroup.ItemContent>
                  <ListGroup.ItemTitle numberOfLines={1}>{cat.name}</ListGroup.ItemTitle>
                </ListGroup.ItemContent>
                {/* Shortcut into the goal editor, only where there's nothing to
                    show yet. Income categories don't take goals. */}
                {goalEditorEnabled && !cat.is_income && parseGoalDef(cat.goal_def).length === 0 ? (
                  <ListGroup.ItemSuffix>
                    <LinkButton size="sm" onPress={() => onAddGoal(cat)}>
                      <LinkButton.Label className="text-accent">{t("addGoal")}</LinkButton.Label>
                    </LinkButton>
                  </ListGroup.ItemSuffix>
                ) : null}
              </ListGroup.Item>
            </Fragment>
          ))}
        </ListGroup>
      )}
    </View>
  );
}
