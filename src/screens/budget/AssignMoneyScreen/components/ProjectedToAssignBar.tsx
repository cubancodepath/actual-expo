import { useTranslation } from "react-i18next";
import { Chip, cn } from "heroui-native";
import { Money } from "@/ui/Money";

interface ProjectedToAssignBarProps {
  /**
   * To-Budget amount reflecting the pending (uncommitted) edits, in cents.
   * Unlike the budget screen's bar, this stays visible at 0 ("fully budgeted").
   */
  projectedToBudget: number;
}

/**
 * Assign Money variant of {@link ReadyToAssignBar}: takes the projected
 * to-budget value as a prop (so it can include local, unsaved deltas) and never
 * hides — at 0 it shows the "fully budgeted" success state.
 */
export function ProjectedToAssignBar({ projectedToBudget }: ProjectedToAssignBarProps) {
  const { t } = useTranslation("budget");

  const negative = projectedToBudget < 0;
  const color = negative ? "danger" : "success";
  const fg = negative ? "text-danger-foreground" : "text-success-foreground";
  const label = negative
    ? "overassigned"
    : projectedToBudget > 0
      ? "readyToAssign"
      : "fullyAssigned";

  return (
    <Chip variant="primary" color={color} size="lg" className="w-full justify-between px-4 py-3">
      <Money cents={projectedToBudget} tone="plain" className={cn("text-xl font-bold", fg)} />
      <Chip.Label className={cn("text-sm font-medium", fg)}>{t(label)}</Chip.Label>
    </Chip>
  );
}
