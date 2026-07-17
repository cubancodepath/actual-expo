import { useTranslation } from "react-i18next";
import { Calendar, DatePicker } from "heroui-native-pro";
import type { LucideIcon } from "lucide-react-native";
import { FieldRow } from "./FieldRow";

/**
 * A FieldRow whose field is a full date, on the HeroUI Pro DatePicker: the
 * row is the trigger and the calendar opens in its popover.
 *
 * Dates cross this boundary as the "YYYY-MM-DD" strings templates store —
 * the same shape the picker's option `value` uses.
 */
export function DateFieldRow({
  icon,
  label,
  value,
  monthOnly = false,
  onChange,
}: {
  icon: LucideIcon;
  label: string;
  /** "YYYY-MM-DD". */
  value: string | undefined;
  /**
   * Show only month and year. For fields whose stored template keeps no day
   * (an annual `by` date is month-granular) — displaying one would lie: it
   * always reads back as the 1st.
   */
  monthOnly?: boolean;
  onChange: (day: string) => void;
}) {
  const { t, i18n } = useTranslation("budget");

  const display = value
    ? new Date(`${value}T00:00:00`).toLocaleDateString(i18n.language, {
        ...(monthOnly ? {} : { day: "numeric" }),
        month: "long",
        year: "numeric",
      })
    : t("goals.notSet");

  return (
    <DatePicker
      value={value ? { value, label: display } : undefined}
      onValueChange={(option) => {
        if (option) onChange(option.value);
      }}
      locale={i18n.language}
      dateDisplayFormat="long"
    >
      <DatePicker.Select>
        {/* The trigger has no unstyled variant — strip its field chrome
            (border, background, shadow) so the FieldRow reads as the row
            itself. The row's own leading icon replaces the indicator. */}
        <DatePicker.Trigger className="h-auto rounded-none border-0 bg-transparent p-0 shadow-none">
          <FieldRow>
            <FieldRow.Icon icon={icon} />
            <FieldRow.Content>
              <FieldRow.Label>{label}</FieldRow.Label>
              {/* The picker owns the text, so this is Value's styling by hand. */}
              <DatePicker.Value className="text-base text-foreground" placeholder={display} />
            </FieldRow.Content>
          </FieldRow>
        </DatePicker.Trigger>
        <DatePicker.Portal>
          <DatePicker.Overlay />
          <DatePicker.Content presentation="popover" width={320}>
            <DatePicker.Calendar>
              <Calendar.Header>
                <Calendar.YearPickerTrigger>
                  <Calendar.YearPickerTriggerHeading />
                  <Calendar.YearPickerTriggerIndicator />
                </Calendar.YearPickerTrigger>
                <Calendar.NavButton slot="previous" />
                <Calendar.NavButton slot="next" />
              </Calendar.Header>
              <Calendar.Grid>
                <Calendar.GridHeader>
                  {(day) => <Calendar.HeaderCell day={day} />}
                </Calendar.GridHeader>
                <Calendar.GridBody>{(date) => <Calendar.Cell date={date} />}</Calendar.GridBody>
              </Calendar.Grid>
              <Calendar.YearPickerGrid>
                <Calendar.YearPickerGridBody>
                  {({ year, isSelected }) => (
                    <Calendar.YearPickerCell year={year} isSelected={isSelected} />
                  )}
                </Calendar.YearPickerGridBody>
              </Calendar.YearPickerGrid>
            </DatePicker.Calendar>
          </DatePicker.Content>
        </DatePicker.Portal>
      </DatePicker.Select>
    </DatePicker>
  );
}
