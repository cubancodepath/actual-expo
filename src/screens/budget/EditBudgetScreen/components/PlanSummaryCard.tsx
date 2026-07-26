import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { ListGroup, Separator } from "heroui-native";
import { Money } from "@/ui/Money";

// Placeholder figures. The layout landed before the bindings did, so these are
// deliberately fixed and named — swapping each for a real spreadsheet read is a
// one-line change once we settle on what this screen should total.
const PLACEHOLDER_ASSIGNED_CENTS = 0;
const PLACEHOLDER_AVAILABLE_CENTS = 0;

/**
 * The card that cuts the hero. Goes inside `EnvelopeSheet.Pinned`: it summarises
 * the plan as a whole, so it stays put while the groups scroll under it.
 */
export function PlanSummaryCard() {
  const { t } = useTranslation("budget");

  return (
    <View className="px-4">
      <ListGroup className="overflow-hidden rounded-2xl shadow-md">
        <ListGroup.Item>
          <ListGroup.ItemContent>
            <ListGroup.ItemTitle>{t("columnBudgeted")}</ListGroup.ItemTitle>
          </ListGroup.ItemContent>
          <ListGroup.ItemSuffix>
            <Money
              cents={PLACEHOLDER_ASSIGNED_CENTS}
              tone="plain"
              className="text-base font-semibold"
            />
          </ListGroup.ItemSuffix>
        </ListGroup.Item>
        <Separator className="mx-4" />
        <ListGroup.Item>
          <ListGroup.ItemContent>
            <ListGroup.ItemTitle>{t("columnAvailable")}</ListGroup.ItemTitle>
          </ListGroup.ItemContent>
          <ListGroup.ItemSuffix>
            <Money
              cents={PLACEHOLDER_AVAILABLE_CENTS}
              tone="plain"
              className="text-base font-semibold"
            />
          </ListGroup.ItemSuffix>
        </ListGroup.Item>
      </ListGroup>
    </View>
  );
}
