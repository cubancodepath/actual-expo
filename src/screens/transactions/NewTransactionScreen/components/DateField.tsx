import { useState } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { BottomSheet, Button, PressableFeedback, Typography, useThemeColor } from "heroui-native";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react-native";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { formatDateLong, todayInt } from "@/lib/date";
import { FieldRow } from "./FieldRow";

function intToDate(d: number): Date {
  const s = String(d);
  return new Date(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8));
}
function dateToInt(d: Date): number {
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

type DateFieldProps = {
  value: number; // YYYYMMDD
  onChange: (dateInt: number) => void;
};

/** Date row with a self-contained month calendar in a bottom sheet. */
export function DateField({ value, onChange }: DateFieldProps) {
  const { t } = useTranslation("transactions");
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => startOfMonth(intToDate(value)));

  const muted = useThemeColor("muted");
  const accent = useThemeColor("accent");
  const selected = intToDate(value);
  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(month)),
    end: endOfWeek(endOfMonth(month)),
  });

  const openSheet = () => {
    setMonth(startOfMonth(intToDate(value)));
    setOpen(true);
  };

  const pick = (day: Date) => {
    onChange(dateToInt(day));
    setOpen(false);
  };

  return (
    <>
      <FieldRow
        icon={CalendarIcon}
        label={t("date")}
        value={formatDateLong(value)}
        onPress={openSheet}
      />
      <BottomSheet isOpen={open} onOpenChange={setOpen}>
        <BottomSheet.Portal>
          <BottomSheet.Overlay />
          <BottomSheet.Content>
            <View className="mb-4 flex-row items-center justify-between">
              <Button
                size="sm"
                variant="secondary"
                isIconOnly
                className="rounded-full"
                onPress={() => setMonth((m) => addMonths(m, -1))}
              >
                <ChevronLeft size={22} color={muted} />
              </Button>
              <Typography className="text-base font-semibold text-foreground">
                {format(month, "MMMM yyyy")}
              </Typography>
              <Button
                size="sm"
                variant="secondary"
                isIconOnly
                className="rounded-full"
                onPress={() => setMonth((m) => addMonths(m, 1))}
              >
                <ChevronRight size={22} color={muted} />
              </Button>
            </View>

            <View className="flex-row flex-wrap">
              {days.map((day) => {
                const isSel = isSameDay(day, selected);
                const dim = day.getMonth() !== month.getMonth();
                return (
                  <PressableFeedback
                    key={day.toISOString()}
                    onPress={() => pick(day)}
                    style={{ width: `${100 / 7}%` }}
                    className="items-center py-1.5"
                  >
                    <View
                      className="h-9 w-9 items-center justify-center rounded-full"
                      style={isSel ? { backgroundColor: accent } : undefined}
                    >
                      <Typography
                        className={isSel ? "text-white" : dim ? "text-muted" : "text-foreground"}
                      >
                        {day.getDate()}
                      </Typography>
                    </View>
                  </PressableFeedback>
                );
              })}
            </View>

            <Button variant="ghost" className="mt-4" onPress={() => pick(intToDate(todayInt()))}>
              <Button.Label className="text-accent">{t("today")}</Button.Label>
            </Button>
          </BottomSheet.Content>
        </BottomSheet.Portal>
      </BottomSheet>
    </>
  );
}
