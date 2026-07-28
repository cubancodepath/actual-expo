import { Fragment } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { Button, ListGroup, Separator, Typography, useThemeColor } from "heroui-native";
import { CirclePlus, EllipsisVertical } from "lucide-react-native";
import { useFeatureFlag } from "@/hooks/useFeatureFlag";
import { PlanCategoryRow } from "./PlanCategoryRow";
import type { BudgetSection } from "@/screens/budget/hooks/useBudgetSections";

/**
 * One group in the plan editor: a header row outside the card (name + actions)
 * over a card of its category names. Unlike the budget table's groups these
 * don't collapse — the whole point of this screen is seeing the plan at once.
 */
export function EditPlanGroup({
  section,
  sheet,
  onAddCategory,
  onOpenDetails,
  onOpenCategory,
  onAddGoal,
}: {
  section: BudgetSection;
  /** The month's sheet name — the rows read their goal cell from it. */
  sheet: string;
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

  return (
    <View>
      <View className="flex-row items-center gap-1 px-1 pb-1 pt-4">
        <Typography className="flex-1 text-sm font-semibold text-foreground" numberOfLines={1}>
          {section.name}
        </Typography>
        <Button
          isIconOnly
          variant="ghost"
          size="sm"
          onPress={onAddCategory}
          accessibilityLabel={t("addGroupAccessibility", { name: section.name })}
        >
          <CirclePlus size={18} color={foreground} />
        </Button>
        <Button
          isIconOnly
          variant="ghost"
          size="sm"
          onPress={onOpenDetails}
          accessibilityLabel={t("editGroupAccessibility", { name: section.name })}
        >
          <EllipsisVertical size={18} color={foreground} />
        </Button>
      </View>

      {section.categories.length > 0 && (
        <ListGroup className="overflow-hidden rounded-2xl">
          {section.categories.map((cat, i) => (
            <Fragment key={cat.id}>
              {i > 0 ? <Separator className="mx-4" /> : null}
              <PlanCategoryRow
                category={cat}
                sheet={sheet}
                goalEditorEnabled={goalEditorEnabled}
                onPress={() => onOpenCategory(cat)}
                onAddGoal={() => onAddGoal(cat)}
              />
            </Fragment>
          ))}
        </ListGroup>
      )}
    </View>
  );
}
