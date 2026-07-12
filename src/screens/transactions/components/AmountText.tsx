import { cn, Typography } from "heroui-native";
import { formatCents } from "@/lib/currency";

type AmountTextProps = {
  /** Magnitude in cents (non-negative). */
  value: number;
  /**
   * Whether this is money coming in. Drives the shared amount colour scheme:
   * inflow → green (including 0.00), outflow → normal colour with a leading "-".
   */
  inflow?: boolean;
  /** Extra classes merged onto the text (size, weight, alignment…). */
  className?: string;
};

/**
 * Read-only amount label with the app's split colour scheme: inflow is green,
 * outflow shows a "-" sign in the normal colour. Shared by `AmountInput` (its
 * display overlay) and the split total so both always look identical.
 */
export function AmountText({ value, inflow = false, className }: AmountTextProps) {
  return (
    <Typography
      numberOfLines={1}
      className={cn(inflow ? "text-positive" : "text-foreground", className)}
    >
      {inflow ? formatCents(value) : `-${formatCents(value)}`}
    </Typography>
  );
}
