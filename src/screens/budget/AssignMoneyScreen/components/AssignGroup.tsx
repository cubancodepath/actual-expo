import { Fragment } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { Accordion, Separator, Surface, Typography } from "heroui-native";
import { useSheetValueNumber } from "@/hooks/useSheetValue";
import { envelopeBudget } from "@/core/server/spreadsheet/bindings";
import { Money } from "@/ui/Money";
import { CollapsibleIndicator } from "@/ui/CollapsibleIndicator";
import { COL_ASSIGNED, NumericCell } from "@/screens/budget/BudgetScreen/components/columns";
import type { BudgetSection } from "@/screens/budget/hooks/useBudgetSections";
import type { PendingEdits } from "../types";
import { AssignCategoryRow } from "./AssignCategoryRow";
import { useSurfaceLevel } from "@/ui/surface-level";

interface AssignGroupProps {
  group: BudgetSection;
  sheet: string;
  editingCatId: string | null;
  draft: number;
  pending: PendingEdits;
  onPressRow: (catId: string, seed: number, pageY: number) => void;
}

/**
 * Single-column ("Assigned") variant of the budget group. The header shows the
 * group's projected budgeted total (live total plus the pending deltas of its
 * rows); the content is a card of {@link AssignCategoryRow}. Not memoised — it
 * re-runs when `pending` changes, but its rows are memoised on primitive props
 * so only the rows whose pending value actually changed re-render.
 */
export function AssignGroup({
  group,
  sheet,
  editingCatId,
  draft,
  pending,
  onPressRow,
}: AssignGroupProps) {
  const { itemVariant } = useSurfaceLevel();
  const { t } = useTranslation("budget");
  const budgeted = useSheetValueNumber(sheet, envelopeBudget.groupBudgeted(group.id));

  const delta = group.categories.reduce((sum, c) => {
    const p = pending[c.id];
    return p ? sum + (p.value - p.original) : sum;
  }, 0);
  const projected = budgeted + delta;

  return (
    <Accordion.Item value={group.id} className="mb-4">
      <Accordion.Trigger className="px-4 py-1.5">
        <View className="flex-1">
          <View className="flex-row justify-end gap-2 pb-0.5">
            <NumericCell width={COL_ASSIGNED}>
              <Typography className="text-[11px] uppercase tracking-wide text-muted">
                {t("columnBudgeted")}
              </Typography>
            </NumericCell>
          </View>

          <View className="flex-row items-center gap-2">
            <CollapsibleIndicator />
            <View className="flex-1">
              <Typography className="text-sm font-semibold text-foreground" numberOfLines={1}>
                {group.name}
              </Typography>
            </View>
            <NumericCell width={COL_ASSIGNED}>
              <Money
                cents={projected}
                tone="plain"
                className={
                  delta !== 0 ? "text-sm font-semibold text-accent" : "text-sm font-semibold"
                }
              />
            </NumericCell>
          </View>
        </View>
      </Accordion.Trigger>

      <Accordion.Content className="px-0 pb-0">
        <Surface variant={itemVariant} className="w-full overflow-hidden rounded-none p-0">
          {group.categories.map((cat, i) => (
            <Fragment key={cat.id}>
              {i > 0 && <Separator className="ml-4" />}
              <AssignCategoryRow
                catId={cat.id}
                catName={cat.name}
                sheet={sheet}
                isEditing={editingCatId === cat.id}
                draft={editingCatId === cat.id ? draft : 0}
                pendingValue={pending[cat.id]?.value}
                onPressRow={onPressRow}
              />
            </Fragment>
          ))}
        </Surface>
      </Accordion.Content>
    </Accordion.Item>
  );
}
