import { useState } from "react";
import { useTranslation } from "react-i18next";
import { BottomSheet, Button } from "heroui-native";
import { Calendar } from "heroui-native-pro";
import { CalendarDate, getLocalTimeZone, today, type DateValue } from "@internationalized/date";
import { OptionRow } from "./OptionRow";

/** Templates store full dates as "YYYY-MM-DD"; the Pro Calendar speaks CalendarDate. */
function toCalendarDate(day: string | undefined): CalendarDate | undefined {
  if (!day) return undefined;
  const [y, m, d] = day.split("-").map(Number);
  if (!y || !m || !d) return undefined;
  return new CalendarDate(y, m, d);
}

function toDayString(d: DateValue): string {
  return `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`;
}

/**
 * A "YYYY-MM-DD" field — the anchor date a recurrence counts from, and the
 * week boundary for a weekly cap.
 */
export function DayField({
  label,
  description,
  value,
  placeholder,
  onChange,
  onClear,
}: {
  label: string;
  description?: string;
  value?: string;
  placeholder?: string;
  onChange: (day: string) => void;
  /** When given, the sheet offers a way to unset an optional date. */
  onClear?: () => void;
}) {
  const { t, i18n } = useTranslation("budget");
  const [open, setOpen] = useState(false);

  const selected = toCalendarDate(value);
  const display = value
    ? new Date(value).toLocaleDateString(i18n.language, {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : (placeholder ?? t("goals.notSet"));

  const pick = (d: DateValue) => {
    onChange(toDayString(d));
    setOpen(false);
  };

  return (
    <>
      <OptionRow
        label={label}
        description={description}
        value={display}
        onPress={() => setOpen(true)}
      />
      <BottomSheet isOpen={open} onOpenChange={setOpen}>
        <BottomSheet.Portal>
          <BottomSheet.Overlay />
          <BottomSheet.Content backgroundClassName="bg-background">
            <Calendar value={selected} onChange={pick} accessibilityLabel={label}>
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
              <Button.Label className="text-accent">{t("goals.today")}</Button.Label>
            </Button>
            {onClear ? (
              <Button
                variant="ghost"
                onPress={() => {
                  onClear();
                  setOpen(false);
                }}
              >
                <Button.Label className="text-danger">{t("goals.clearDate")}</Button.Label>
              </Button>
            ) : null}
          </BottomSheet.Content>
        </BottomSheet.Portal>
      </BottomSheet>
    </>
  );
}
