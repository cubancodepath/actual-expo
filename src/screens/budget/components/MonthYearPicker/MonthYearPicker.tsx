import { useState } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { cn, Popover, PressableFeedback, Typography, useThemeColor } from "heroui-native";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react-native";
import { currentMonth, formatMonth, monthKey, monthShortNames } from "@/core/shared/months";
import { SurfaceLevel } from "@/ui/surface-level";

interface MonthYearPickerProps {
  /** Selected budget month, "YYYY-MM". */
  value: string;
  /** Called with the picked month, "YYYY-MM". */
  onChange: (month: string) => void;
  /**
   * Classes for the trigger's label. Defaults to the budget header's size;
   * pass e.g. `"text-base text-muted"` to sit inside a form row.
   */
  triggerClassName?: string;
}

/**
 * Budget month selector rendered as a Popover: the trigger shows the current
 * month ("July 2026 ⌄") and the panel is a custom year navigator with a 3×4
 * grid of months — the HeroUI Pro Calendar is day-based, so month selection is
 * built by hand here. Purely presentational: state lives in the parent.
 */
export function MonthYearPicker({ value, onChange, triggerClassName }: MonthYearPickerProps) {
  const { i18n } = useTranslation();
  const foreground = useThemeColor("foreground");
  const muted = useThemeColor("muted");

  const selectedYear = Number(value.slice(0, 4));
  const selectedMonth1 = Number(value.slice(5, 7));

  const [open, setOpen] = useState(false);
  // Year shown in the grid. Re-seeds from the selected month each time the
  // popover opens so it always lands on the active year.
  const [year, setYear] = useState(selectedYear);

  const cur = currentMonth();
  const curYear = Number(cur.slice(0, 4));
  const curMonth1 = Number(cur.slice(5, 7));

  const names = monthShortNames(i18n.language);

  function handleOpenChange(next: boolean) {
    if (next) setYear(selectedYear);
    setOpen(next);
  }

  function pick(month1: number) {
    onChange(monthKey(year, month1));
    setOpen(false);
  }

  return (
    <Popover isOpen={open} onOpenChange={handleOpenChange}>
      <Popover.Trigger asChild>
        <PressableFeedback className="flex-row items-center gap-1">
          <Typography className={cn("text-lg font-semibold text-foreground", triggerClassName)}>
            {formatMonth(value, i18n.language)}
          </Typography>
          <ChevronDown size={18} color={muted} />
        </PressableFeedback>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Overlay />
        <Popover.Content presentation="popover" placement="bottom" align="start" width={288}>
          <SurfaceLevel context="sheet">
            {/* Year navigator */}
            <View className="flex-row items-center justify-between px-1 pb-3">
              <PressableFeedback
                className="h-9 w-9 items-center justify-center rounded-full"
                onPress={() => setYear((y) => y - 1)}
                accessibilityLabel="Previous year"
              >
                <ChevronLeft size={20} color={foreground} />
              </PressableFeedback>
              <Typography className="text-base font-semibold text-foreground">{year}</Typography>
              <PressableFeedback
                className="h-9 w-9 items-center justify-center rounded-full"
                onPress={() => setYear((y) => y + 1)}
                accessibilityLabel="Next year"
              >
                <ChevronRight size={20} color={foreground} />
              </PressableFeedback>
            </View>

            {/* Month grid (3 rows × 4 cols) */}
            <View className="flex-row flex-wrap">
              {names.map((name, i) => {
                const month1 = i + 1;
                const isSelected = year === selectedYear && month1 === selectedMonth1;
                const isCurrent = year === curYear && month1 === curMonth1;
                return (
                  <View key={month1} className="w-1/4 p-1">
                    <PressableFeedback
                      onPress={() => pick(month1)}
                      className={cn(
                        "h-10 items-center justify-center rounded-lg",
                        isSelected && "bg-accent",
                        !isSelected && isCurrent && "border border-accent",
                      )}
                    >
                      <Typography
                        className={cn(
                          "text-sm font-medium capitalize",
                          isSelected ? "text-accent-foreground" : "text-foreground",
                        )}
                      >
                        {name}
                      </Typography>
                    </PressableFeedback>
                  </View>
                );
              })}
            </View>
          </SurfaceLevel>
        </Popover.Content>
      </Popover.Portal>
    </Popover>
  );
}
