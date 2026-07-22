import { useTranslation } from "react-i18next";
import { useSyncedPref } from "@/lib/hooks/useSyncedPref";
import { useDaysOfWeek } from "@/screens/settings/lib/useDaysOfWeek";
import { SettingsOptionList } from "@/screens/settings/components/SettingsOptionList";

/** First-day-of-the-week picker with localized day names (upstream parity). */
export function FirstDayOfWeekScreen() {
  const { t } = useTranslation("settings");
  const [firstDayOfWeekIdx, setFirstDayOfWeekIdx] = useSyncedPref("firstDayOfWeekIdx");
  const days = useDaysOfWeek();

  return (
    <SettingsOptionList
      title={t("firstDayOfWeek")}
      options={days}
      value={firstDayOfWeekIdx || "0"}
      onSelect={(v) => void setFirstDayOfWeekIdx(v)}
    />
  );
}
