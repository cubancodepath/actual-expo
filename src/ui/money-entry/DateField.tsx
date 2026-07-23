import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { Typography, useThemeColor } from "heroui-native";
import { Calendar, DatePicker } from "heroui-native-pro";
import { Calendar as CalendarIcon, ChevronRight } from "lucide-react-native";
import { intToStr, strToInt } from "@/core/shared/months";
import { useDateFormat } from "@/lib/hooks/useDateFormat";
import { useFirstDayOfWeek, weekdayCode } from "@/lib/hooks/useFirstDayOfWeek";

type DateFieldProps = {
  value: number; // YYYYMMDD
  onChange: (dateInt: number) => void;
};

/**
 * Date row backed by the HeroUI `DatePicker` (trigger + calendar). Styled as a
 * field row (icon · label · value · chevron) to match the other form rows; the
 * calendar opens in a bottom sheet. The picker speaks ISO date strings, we store
 * a YYYYMMDD int — convert at the boundary.
 */
export function DateField({ value, onChange }: DateFieldProps) {
  const { t, i18n } = useTranslation("transactions");
  const muted = useThemeColor("muted");
  const { formatLong } = useDateFormat();
  const firstDay = useFirstDayOfWeek();

  return (
    <DatePicker
      value={{ value: intToStr(value), label: formatLong(value) }}
      onValueChange={(opt) => {
        if (!opt) return;
        const next = strToInt(opt.value);
        if (next != null) onChange(next);
      }}
    >
      <DatePicker.Select presentation="bottom-sheet">
        {/* Neutralize the default trigger box (border/bg/shadow/radius) so our
            field row is the whole look, flush like the other rows. */}
        <DatePicker.Trigger className="h-auto rounded-none border-0 bg-transparent p-0 shadow-none">
          <View className="flex-row items-center gap-3 px-4 py-3.5">
            <CalendarIcon size={18} color={muted} />
            <Typography className="text-base text-muted">{t("date")}</Typography>
            <View className="flex-1" />
            <Typography
              numberOfLines={1}
              className="text-base text-foreground"
              style={{ maxWidth: 190 }}
            >
              {formatLong(value)}
            </Typography>
            <ChevronRight size={16} color={muted} />
          </View>
        </DatePicker.Trigger>
        <DatePicker.Portal>
          <DatePicker.Overlay />
          <DatePicker.Content presentation="bottom-sheet">
            <DatePicker.Calendar firstDayOfWeek={weekdayCode(firstDay)} locale={i18n.language}>
              <Calendar.Header>
                <Calendar.Heading />
                <Calendar.NavButton slot="previous" />
                <Calendar.NavButton slot="next" />
              </Calendar.Header>
              <Calendar.Grid>
                <Calendar.GridHeader>
                  {(day) => <Calendar.HeaderCell day={day} />}
                </Calendar.GridHeader>
                <Calendar.GridBody>{(date) => <Calendar.Cell date={date} />}</Calendar.GridBody>
              </Calendar.Grid>
            </DatePicker.Calendar>
          </DatePicker.Content>
        </DatePicker.Portal>
      </DatePicker.Select>
    </DatePicker>
  );
}
