import { useTranslation } from "react-i18next";
import { Chip, cn, PressableFeedback } from "heroui-native";
import { useSheetValueNumber } from "@/hooks/useSheetValue";
import { envelopeBudget } from "@/core/domain/spreadsheet/bindings";
import { Money } from "@/ui/Money";

interface ReadyToAssignBarProps {
  sheet: string;
  /** When provided, the bar becomes tappable (e.g. to open the Assign Money modal). */
  onPress?: () => void;
}

/**
 * The key budget indicator: how much is left to assign, or by how much you've
 * overbudgeted. Same primary-chip language as the per-row Available chips, but
 * large and full-width. Hidden entirely when everything is assigned (0).
 */
export function ReadyToAssignBar({ sheet, onPress }: ReadyToAssignBarProps) {
  const { t } = useTranslation("budget");
  const toBudget = useSheetValueNumber(sheet, envelopeBudget.toBudget);

  if (toBudget === 0) return null;

  const positive = toBudget > 0;
  const color = positive ? "success" : "danger";
  const fg = positive ? "text-success-foreground" : "text-danger-foreground";

  // The Chip renders its own Pressable, so `pointerEvents="none"` lets the touch
  // fall through to the PressableFeedback wrapper, which owns the press + scale.
  const chip = (
    <Chip
      variant="primary"
      color={color}
      size="lg"
      pointerEvents={onPress ? "none" : "auto"}
      className="w-full justify-between px-4 py-3"
    >
      <Money cents={toBudget} tone="plain" className={cn("text-xl font-bold", fg)} />
      <Chip.Label className={cn("text-sm font-medium", fg)}>
        {t(positive ? "readyToAssign" : "overassigned")}
      </Chip.Label>
    </Chip>
  );

  if (!onPress) return chip;

  return (
    <PressableFeedback animation={false} onPress={onPress}>
      <PressableFeedback.Scale>{chip}</PressableFeedback.Scale>
      <PressableFeedback.Highlight className="rounded-3xl" />
    </PressableFeedback>
  );
}
