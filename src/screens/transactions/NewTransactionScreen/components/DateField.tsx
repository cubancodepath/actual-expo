import { useState } from "react";
import { useTranslation } from "react-i18next";
import { BottomSheet, Button } from "heroui-native";
import { Calendar } from "heroui-native-pro";
import { CalendarDate, getLocalTimeZone, today, type DateValue } from "@internationalized/date";
import { Calendar as CalendarIcon } from "lucide-react-native";
import { formatDateLong } from "@/lib/date";
import { FieldRow } from "./FieldRow";

/** Our stored date is a YYYYMMDD int; the Pro Calendar speaks `CalendarDate`. */
function intToCalendarDate(d: number): CalendarDate {
  const s = String(d);
  return new CalendarDate(+s.slice(0, 4), +s.slice(4, 6), +s.slice(6, 8));
}
function dateValueToInt(d: DateValue): number {
  return d.year * 10000 + d.month * 100 + d.day;
}

type DateFieldProps = {
  value: number; // YYYYMMDD
  onChange: (dateInt: number) => void;
};

/** Date row with the HeroUI Pro Calendar in a bottom sheet. */
export function DateField({ value, onChange }: DateFieldProps) {
  const { t } = useTranslation("transactions");
  const [open, setOpen] = useState(false);

  const pick = (d: DateValue) => {
    onChange(dateValueToInt(d));
    setOpen(false);
  };

  return (
    <>
      <FieldRow
        icon={CalendarIcon}
        label={t("date")}
        value={formatDateLong(value)}
        onPress={() => setOpen(true)}
      />
      <BottomSheet isOpen={open} onOpenChange={setOpen}>
        <BottomSheet.Portal>
          <BottomSheet.Overlay />
          <BottomSheet.Content backgroundClassName="bg-background">
            <Calendar
              value={intToCalendarDate(value)}
              onChange={pick}
              accessibilityLabel={t("date")}
            >
              <Calendar.Header>
                <Calendar.Heading />
                <Calendar.NavButton slot="previous" />
                <Calendar.NavButton slot="next" />
              </Calendar.Header>
              <Calendar.Grid>
                <Calendar.GridHeader>
                  {(day) => <Calendar.HeaderCell>{day}</Calendar.HeaderCell>}
                </Calendar.GridHeader>
                <Calendar.GridBody>
                  {(date) => (
                    <Calendar.Cell date={date}>
                      {(renderProps) => (
                        <Calendar.CellBody cellRenderProps={renderProps}>
                          <Calendar.CellLabel cellRenderProps={renderProps}>
                            {renderProps.formattedDate}
                          </Calendar.CellLabel>
                        </Calendar.CellBody>
                      )}
                    </Calendar.Cell>
                  )}
                </Calendar.GridBody>
              </Calendar.Grid>
            </Calendar>

            <Button
              variant="ghost"
              className="mt-2"
              onPress={() => pick(today(getLocalTimeZone()))}
            >
              <Button.Label className="text-accent">{t("today")}</Button.Label>
            </Button>
          </BottomSheet.Content>
        </BottomSheet.Portal>
      </BottomSheet>
    </>
  );
}
