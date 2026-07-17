import { memo } from "react";
import { View } from "react-native";
import { Typography } from "heroui-native";
import { useSheetValueNumber } from "@/hooks/useSheetValue";
import { envelopeBudget } from "@/core/domain/spreadsheet/bindings";
import { Money } from "@/ui/Money";
import { COL_AVAILABLE, NumericCell } from "./columns";

interface IncomeCategoryRowProps {
  catId: string;
  catName: string;
  sheet: string;
}

/**
 * An income category row: name | Received. Read-only — no inline editing and
 * no long-press menu (those belong to the expense variant, `BudgetCategoryRow`).
 */
export const IncomeCategoryRow = memo(function IncomeCategoryRow({
  catId,
  catName,
  sheet,
}: IncomeCategoryRowProps) {
  const spent = useSheetValueNumber(sheet, envelopeBudget.catSpent(catId));

  return (
    <View className="w-full flex-row items-center gap-2 px-4 py-2.5">
      <View className="flex-1">
        <Typography className="text-base text-foreground" numberOfLines={1}>
          {catName}
        </Typography>
      </View>
      <NumericCell width={COL_AVAILABLE}>
        <Money cents={spent} tone="plain" className="text-sm" />
      </NumericCell>
    </View>
  );
});
