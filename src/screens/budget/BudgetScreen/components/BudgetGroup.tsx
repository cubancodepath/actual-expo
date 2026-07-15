import { Fragment, memo } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { Accordion, Separator, Surface, Typography } from "heroui-native";
import { useSheetValueNumber } from "@/hooks/useSheetValue";
import { envelopeBudget } from "@/core/domain/spreadsheet/bindings";
import { Money } from "@/ui/Money";
import type { BudgetSection } from "@/screens/budget/hooks/useBudgetSections";
import { BudgetCategoryRow } from "./BudgetCategoryRow";
import { COL_ASSIGNED, COL_AVAILABLE, NumericCell } from "./columns";

interface BudgetGroupProps {
  group: BudgetSection;
  sheet: string;
  editingCatId: string | null;
  draft: number;
  onPressRow: (catId: string, budgeted: number, pageY: number) => void;
}

/** Small muted column label, right-aligned over its numeric column. */
function ColumnLabel({ width, children }: { width: number; children: string }) {
  return (
    <NumericCell width={width}>
      <Typography className="text-[11px] uppercase tracking-wide text-muted">{children}</Typography>
    </NumericCell>
  );
}

/**
 * One collapsible budget group. The trigger is a two-row "section" header that
 * sits outside the card (column labels + chevron-left/name/totals); the content
 * is a full-width Surface card holding the category rows. Memoised — `group` is a
 * stable ref from useBudgetSections and `sheet` a string, so groups skip
 * re-render on accordion toggles.
 */
export const BudgetGroup = memo(function BudgetGroup({
  group,
  sheet,
  editingCatId,
  draft,
  onPressRow,
}: BudgetGroupProps) {
  const { t } = useTranslation("budget");
  const budgeted = useSheetValueNumber(sheet, envelopeBudget.groupBudgeted(group.id));
  const spent = useSheetValueNumber(sheet, envelopeBudget.groupSpent(group.id));
  const balance = useSheetValueNumber(sheet, envelopeBudget.groupBalance(group.id));

  return (
    <Accordion.Item value={group.id} className="mb-4">
      <Accordion.Trigger className="px-4 py-1.5">
        {/* Column wrapper so the two rows stack vertically regardless of the
            trigger's default (row) layout. */}
        <View className="flex-1">
          {/* Row 1 — column labels (gap-2 matches the numeric row's column gap). */}
          <View className="flex-row justify-end gap-2 pb-0.5">
            {group.is_income ? (
              <ColumnLabel width={COL_AVAILABLE}>{t("columnReceived")}</ColumnLabel>
            ) : (
              <>
                <ColumnLabel width={COL_ASSIGNED}>{t("columnBudgeted")}</ColumnLabel>
                <ColumnLabel width={COL_AVAILABLE}>{t("columnAvailable")}</ColumnLabel>
              </>
            )}
          </View>

          {/* Row 2 — chevron (left) + name + totals */}
          <View className="flex-row items-center gap-2">
            <Accordion.Indicator />
            <View className="flex-1">
              <Typography className="text-sm font-semibold text-foreground" numberOfLines={1}>
                {group.name}
              </Typography>
            </View>
            {group.is_income ? (
              <NumericCell width={COL_AVAILABLE}>
                <Money cents={spent} tone="plain" className="text-sm font-semibold" />
              </NumericCell>
            ) : (
              <>
                <NumericCell width={COL_ASSIGNED}>
                  <Money cents={budgeted} tone="plain" className="text-sm font-semibold" />
                </NumericCell>
                {/* Group total: plain number, normal text colour regardless of sign
                    (no positive/negative scheme — that lives on the per-row chips). */}
                <NumericCell width={COL_AVAILABLE}>
                  <Money cents={balance} tone="plain" className="text-sm font-semibold" />
                </NumericCell>
              </>
            )}
          </View>
        </View>
      </Accordion.Trigger>

      <Accordion.Content className="px-0 pb-0">
        <Surface className="w-full overflow-hidden rounded-none p-0">
          {group.categories.map((cat, i) => (
            <Fragment key={cat.id}>
              {i > 0 && <Separator className="ml-4" />}
              <BudgetCategoryRow
                catId={cat.id}
                catName={cat.name}
                sheet={sheet}
                isIncome={group.is_income}
                isEditing={editingCatId === cat.id}
                draft={editingCatId === cat.id ? draft : 0}
                onPressRow={onPressRow}
              />
            </Fragment>
          ))}
        </Surface>
      </Accordion.Content>
    </Accordion.Item>
  );
});
