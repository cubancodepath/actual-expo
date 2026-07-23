import { useMemo, useState } from "react";
import { View } from "react-native";
// A React portal carries the outer ScrollView's VirtualizedList context down to
// the wheels' FlatLists; resetting it avoids the nested-list warning + blanking.
import { VirtualizedListContextResetter } from "react-native/Libraries/Lists/VirtualizedListContext";
import { useTranslation } from "react-i18next";
import { BottomSheet, Button, Typography } from "heroui-native";
import { WheelPicker, WheelPickerGroup } from "heroui-native-pro";
import { CalendarDays } from "lucide-react-native";
import { format, getDate, getDay, getDaysInMonth, getMonth, setDay, setMonth } from "date-fns";
import type { RecurConfig } from "@/core/types/models";
import { parseDate, dayFromDate } from "@/core/shared/schedules";
import { FieldRow } from "./FieldRow";

type Props = {
  value: RecurConfig;
  onChange: (config: RecurConfig) => void;
};

const REF = new Date(2024, 0, 7); // a Sunday, for stable weekday/month labels
const weekdayItems = Array.from({ length: 7 }, (_, i) => ({
  value: i,
  label: format(setDay(REF, i), "EEEE"),
}));
const monthItems = Array.from({ length: 12 }, (_, i) => ({
  value: i,
  label: format(setMonth(REF, i), "MMMM"),
}));
const dayItems = Array.from({ length: 31 }, (_, i) => ({ value: i + 1, label: String(i + 1) }));

/**
 * "On…" field: chooses the day pattern for the recurrence via wheel pickers —
 * weekly → weekday, monthly → day of month (+ last day), yearly → month + day.
 * A single day per frequency; writes back into the RecurConfig (weekly/yearly
 * anchor on `start`, monthly uses a `{type:"day"}` pattern). Shared by the
 * schedule editor and the transaction Repeat.
 */
export function RecurrencePatternField({ value, onChange }: Props) {
  const { t } = useTranslation(["schedules", "common"]);
  const [open, setOpen] = useState(false);
  const start = parseDate(value.start);

  const monthlyPattern = value.patterns?.find((p) => p.type === "day");
  const monthlyDay = monthlyPattern ? monthlyPattern.value : getDate(start);

  const monthlyItems = useMemo(() => [...dayItems, { value: -1, label: t("lastDay") }], [t]);

  // Yearly: the day wheel follows the selected month, so Feb caps at 28/29, etc.
  const year = start.getFullYear();
  const yearMonth = getMonth(start);
  const yearDay = getDate(start);
  const yearDayItems = useMemo(
    () =>
      Array.from({ length: getDaysInMonth(new Date(year, yearMonth, 1)) }, (_, i) => ({
        value: i + 1,
        label: String(i + 1),
      })),
    [year, yearMonth],
  );

  let summary = "";
  if (value.frequency === "weekly") summary = format(start, "EEEE");
  else if (value.frequency === "monthly")
    summary = monthlyDay === -1 ? t("lastDay") : t("dayOfMonth", { day: monthlyDay });
  else if (value.frequency === "yearly") summary = format(start, "MMM d");

  return (
    <>
      <FieldRow
        icon={CalendarDays}
        label={t("repeatOn")}
        value={summary}
        onPress={() => setOpen(true)}
      />
      <BottomSheet isOpen={open} onOpenChange={setOpen}>
        <BottomSheet.Portal>
          <BottomSheet.Overlay />
          <BottomSheet.Content backgroundClassName="bg-background">
            <View className="px-4 pb-2">
              <Typography className="mb-2 text-center text-lg font-semibold text-foreground">
                {t("repeatOn")}
              </Typography>
              <VirtualizedListContextResetter>
                {value.frequency === "weekly" && (
                  <WheelPickerGroup
                    values={{ weekday: getDay(start) }}
                    onValuesChange={(next) =>
                      onChange({
                        ...value,
                        start: dayFromDate(setDay(start, next.weekday as number)),
                      })
                    }
                  >
                    <WheelPicker name="weekday" items={weekdayItems} />
                    <WheelPickerGroup.Indicator />
                    <WheelPickerGroup.Mask />
                  </WheelPickerGroup>
                )}

                {value.frequency === "monthly" && (
                  <WheelPickerGroup
                    values={{ day: monthlyDay }}
                    onValuesChange={(next) =>
                      onChange({ ...value, patterns: [{ type: "day", value: next.day as number }] })
                    }
                  >
                    <WheelPicker
                      name="day"
                      items={monthlyItems}
                      classNames={{ itemLabel: "tabular-nums" }}
                    />
                    <WheelPickerGroup.Indicator />
                    <WheelPickerGroup.Mask />
                  </WheelPickerGroup>
                )}

                {value.frequency === "yearly" && (
                  <WheelPickerGroup
                    values={{ month: yearMonth, day: yearDay }}
                    onValuesChange={(next) => {
                      const month = next.month as number;
                      // Clamp the day to the chosen month's length (Feb → 28/29).
                      const day = Math.min(
                        next.day as number,
                        getDaysInMonth(new Date(year, month, 1)),
                      );
                      onChange({ ...value, start: dayFromDate(new Date(year, month, day)) });
                    }}
                  >
                    <WheelPicker name="month" items={monthItems} />
                    <WheelPicker
                      name="day"
                      items={yearDayItems}
                      classNames={{ itemLabel: "tabular-nums" }}
                    />
                    <WheelPickerGroup.Indicator />
                    <WheelPickerGroup.Mask />
                  </WheelPickerGroup>
                )}
              </VirtualizedListContextResetter>

              <Button variant="secondary" className="mt-2" onPress={() => setOpen(false)}>
                <Button.Label>{t("done", { ns: "common" })}</Button.Label>
              </Button>
            </View>
          </BottomSheet.Content>
        </BottomSheet.Portal>
      </BottomSheet>
    </>
  );
}
