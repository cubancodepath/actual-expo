import { useMemo } from "react";
import { View } from "react-native";
import { Typography, useThemeColor } from "heroui-native";
import { formatCents } from "@/lib/currency";
import { Money } from "@/ui/Money";
import { BlinkingCursor } from "@/ui/BlinkingCursor";

const BASE_FONT_SIZE = 44;
const LINE_HEIGHT = 58;
const SCALE_PER_CHAR = 0.035;
const MIN_SCALE = 0.45;

/** Shrink the font as the number grows so long amounts stay on one line. */
function fontSizeFor(chars: number): number {
  return BASE_FONT_SIZE * Math.max(MIN_SCALE, 1 - chars * SCALE_PER_CHAR);
}

/**
 * The goal's amount, shown as the headline of its editor. Pure view — wrap it
 * in `AmountKeyboard.Trigger` to make it editable.
 */
export function AmountHero({
  value,
  label,
  isEditing,
}: {
  /** Positive cents. */
  value: number;
  label: string;
  isEditing: boolean;
}) {
  const accent = useThemeColor("accent");
  // +1 approximates the currency symbol Money adds to the formatted number.
  const fontSize = useMemo(() => fontSizeFor(formatCents(value).length + 1), [value]);

  return (
    <View className="items-center py-4">
      <Typography className="mb-1 text-xs font-semibold uppercase text-muted">{label}</Typography>
      <View className="h-14.5 w-full flex-row items-center justify-center">
        <Money
          cents={value}
          tone="plain"
          className="shrink"
          valueStyle={{
            fontSize,
            fontWeight: "700",
            fontFamily: "Nunito_700Bold",
            lineHeight: LINE_HEIGHT,
            textAlign: "center",
          }}
        />
        {isEditing ? <BlinkingCursor color={accent} height={38} width={3} /> : null}
      </View>
    </View>
  );
}
