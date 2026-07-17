import { View } from "react-native";
import { Chip, useThemeColor } from "heroui-native";
import { ArrowRight } from "lucide-react-native";
import { Money } from "@/ui/Money";
import type { ChipStatus } from "../chipStatus";

interface AvailableChipProps {
  /** Available (leftover) amount in cents. */
  cents: number;
  /**
   * Colour state. When omitted, falls back to colouring by the amount's sign
   * (positive = success, zero = neutral, negative = overspent) — used where
   * there's no goal context. With goals, the row passes a goal-aware status.
   */
  status?: ChipStatus;
  /** This month's balance rolls over — shows the carryover arrow. */
  carryover?: boolean;
}

// Literal classes (not interpolated) so uniwind can see them statically.
const LABEL_CLASS = {
  success: "text-success-foreground",
  warning: "text-warning-foreground",
  danger: "text-danger-foreground",
  default: "text-default-foreground",
} as const;

/**
 * Status chip for the "Available" column. `primary` (solid) variant for strong
 * contrast. Colour conveys funding state: green funded / yellow underfunded /
 * red overspent (goal-aware via `status`), or by sign when no goal. The amount
 * is rendered with `Money` (locale-aware) in the chip's on-colour foreground.
 */
export function AvailableChip({ cents, status, carryover = false }: AvailableChipProps) {
  const state: ChipStatus = status ?? (cents > 0 ? "success" : cents < 0 ? "danger" : "default");
  const muted = useThemeColor("muted");

  return (
    <View>
      <Chip variant="primary" color={state} size="sm">
        <Money
          cents={cents}
          tone="plain"
          className={`text-xs font-semibold ${LABEL_CLASS[state]}`}
        />
      </Chip>
      {/* Desktop's CarryoverIndicator technique: absolutely positioned in the
          row padding, out of the flow, so the column grid never shifts. */}
      {carryover ? (
        <View className="absolute -right-3.5 inset-y-0 justify-center">
          <ArrowRight size={10} color={muted} />
        </View>
      ) : null}
    </View>
  );
}
