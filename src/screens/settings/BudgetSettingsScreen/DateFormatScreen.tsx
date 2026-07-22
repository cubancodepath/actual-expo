import { useTranslation } from "react-i18next";
import { useSyncedPref } from "@/lib/hooks/useSyncedPref";
import { DATE_FORMAT_OPTIONS } from "@/core/domain/preferences/types";
import { SettingsOptionList } from "@/screens/settings/components/SettingsOptionList";

/** Date format picker (MM/DD/YYYY, …). Label = pattern, description = example. */
export function DateFormatScreen() {
  const { t } = useTranslation("settings");
  const [dateFormat, setDateFormat] = useSyncedPref("dateFormat");

  const options = DATE_FORMAT_OPTIONS.map((o) => ({
    value: o.value,
    label: o.label,
    description: o.example,
  }));

  return (
    <SettingsOptionList
      title={t("dateFormat")}
      options={options}
      value={dateFormat || "MM/dd/yyyy"}
      onSelect={(v) => void setDateFormat(v)}
    />
  );
}
