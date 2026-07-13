import { Chip } from "heroui-native";
import { Money } from "@/ui/Money";

interface AvailableChipProps {
  /** Available (leftover) amount in cents. */
  cents: number;
}

/**
 * Status chip for the "Available" column. `primary` (solid) variant for strong
 * contrast; colour conveys state by sign — until goals return, that's the whole
 * story: positive = good, zero = neutral, negative = overspent. The amount is
 * rendered with `Money` (locale-aware) in the chip's on-colour foreground.
 */
// Literal classes (not interpolated) so uniwind can see them statically.
const LABEL_CLASS = {
  success: "text-success-foreground",
  danger: "text-danger-foreground",
  default: "text-default-foreground",
} as const;

export function AvailableChip({ cents }: AvailableChipProps) {
  const state = cents > 0 ? "success" : cents < 0 ? "danger" : "default";

  return (
    <Chip variant="primary" color={state} size="sm">
      <Money cents={cents} tone="plain" className={`text-xs font-semibold ${LABEL_CLASS[state]}`} />
    </Chip>
  );
}
