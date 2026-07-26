import { View } from "react-native";
import { cn, useThemeColor } from "heroui-native";
import { Pencil } from "lucide-react-native";
import { AmountKeyboard, useAmountKeyboardState } from "@/ui/amount-keyboard";
import { BlinkingCursor } from "@/ui/BlinkingCursor";
import { Money } from "@/ui/Money";

/**
 * Horizontal padding inside the field's box. Exported because the card's other
 * amounts have to pay the same inset to line up with this one — see
 * `AMOUNT_INSET` there.
 */
export const INCOME_FIELD_PADDING = "px-3";

/**
 * The income amount in {@link PlanSummaryCard}, which wears its chrome only for
 * as long as it's needed. Three states, one control:
 *
 * - **Empty (0.00, idle)** — full input chrome: border, field background, the
 *   works. Nothing else on this screen is a field, so an untouched zero has to
 *   advertise that it's askng for something rather than reporting it.
 * - **Filled (idle)** — plain text with a pencil ahead of it. The number is now
 *   an answer, and an answer belongs in the card's own voice; the pencil is
 *   enough to say it can still be changed.
 * - **Editing** — no chrome at all, just the figure and the caret. A box drawn
 *   around a number you're already typing into is redundant: the caret and the
 *   keypad both already say so.
 *
 * Reads value and open-state from `<AmountKeyboard>` context, like `AmountField`
 * does. This is its own component rather than a variant of that one because the
 * "chrome only while empty" rule is this card's argument, not a general one.
 */
export function IncomeField() {
  const { value, isOpen } = useAmountKeyboardState();
  const accent = useThemeColor("accent");
  const muted = useThemeColor("muted");

  const isEmpty = value === 0 && !isOpen;

  return (
    <AmountKeyboard.Trigger>
      <View
        className={cn(
          // Wide enough that the box reads as a field rather than as a chip, and
          // that a five-figure income doesn't reflow the row when it's typed.
          "min-w-36 flex-row items-center justify-end gap-2 py-2",
          INCOME_FIELD_PADDING,
          isEmpty &&
            "min-h-12 rounded-field border-field-width border-field-border bg-field ios:shadow-field android:shadow-sm",
        )}
      >
        {!isEmpty && !isOpen ? <Pencil size={14} color={muted} /> : null}
        {/* Caret kept in the number's own row so it hugs the last digit. */}
        <View className="flex-row items-center">
          <Money
            cents={value}
            tone="plain"
            mask={false}
            className="text-base font-semibold text-foreground"
          />
          {isOpen ? <BlinkingCursor color={accent} /> : null}
        </View>
      </View>
    </AmountKeyboard.Trigger>
  );
}
