import { useTranslation } from "react-i18next";
import { DAY_OF_WEEK_OPTIONS } from "@/core/server/preferences/types";

/**
 * Localized day-of-week labels keyed by the `firstDayOfWeekIdx` value ("0"–"6",
 * Sunday-first, Pikaday numbering). Mirrors upstream's `useDaysOfWeek`.
 */
export function useDaysOfWeek(): { value: string; label: string }[] {
  const { t } = useTranslation("settings");
  return DAY_OF_WEEK_OPTIONS.map((d) => ({
    value: d.value,
    label: t(`weekdays.${d.value}` as never, { defaultValue: d.label }),
  }));
}
