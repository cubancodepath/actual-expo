import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { Accordion, PressableFeedback, Surface, Typography } from "heroui-native";
import { CollapsibleIndicator } from "@/ui/CollapsibleIndicator";

/**
 * Accordion value for the hidden section. Not a group id — no such group exists —
 * so it can never collide with one, and it stays out of the seeded expanded set
 * in `BudgetScreen`, which means the section starts collapsed.
 */
export const HIDDEN_SECTION_VALUE = "__hidden__";

/**
 * The way into {@link HiddenCategoriesScreen} from the budget table.
 *
 * An `Accordion.Item` like every other section here, because a lone
 * non-collapsible block among collapsible groups reads as something pasted on.
 * It holds exactly one row, and that row navigates — the table is about money,
 * and bringing categories back is structural work that belongs on its own screen.
 *
 * Mirrors {@link BudgetGroup}'s skin: `px-4 py-1.5` trigger over a full-bleed
 * `rounded-none` Surface. The plan editor's rounded card would look foreign in
 * this room.
 */
export function HiddenSectionLink({ count, onPress }: { count: number; onPress: () => void }) {
  const { t } = useTranslation("budget");

  return (
    <Accordion.Item value={HIDDEN_SECTION_VALUE} className="mb-4">
      <Accordion.Trigger className="px-4 py-1.5">
        <View className="flex-1 flex-row items-center gap-2">
          <CollapsibleIndicator />
          <Typography className="flex-1 text-sm font-semibold text-foreground" numberOfLines={1}>
            {t("hiddenSection")}
          </Typography>
        </View>
      </Accordion.Trigger>

      <Accordion.Content className="px-0 pb-0">
        <Surface className="w-full overflow-hidden rounded-none p-0">
          <PressableFeedback onPress={onPress} className="flex-row items-center px-4 py-2.5">
            <Typography className="flex-1 text-base text-foreground" numberOfLines={1}>
              {t("nHiddenCategories", { count })}
            </Typography>
          </PressableFeedback>
        </Surface>
      </Accordion.Content>
    </Accordion.Item>
  );
}
