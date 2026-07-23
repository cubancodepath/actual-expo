import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { ListGroup, Typography } from "heroui-native";
import type { GoalTemplate } from "@/core/types/models";
import { AmountRow } from "../fields/AmountRow";

/**
 * A balance to work toward. Budgets nothing on its own — it turns the
 * category's indicator into progress toward this amount, and the user decides
 * when to fund it. One field is the whole editor.
 */
export function BalanceTargetEditor({ template }: { template: GoalTemplate }) {
  const { t } = useTranslation("budget");
  return (
    <View className="gap-3">
      <ListGroup>
        <AmountRow
          label={t("goals.fields.targetBalance")}
          cents={Math.round(template.amount * 100)}
        />
      </ListGroup>
      <Typography className="px-4 text-sm text-muted">{t("goals.descriptions.goal")}</Typography>
    </View>
  );
}
