import { useTranslation } from "react-i18next";
import { useSyncedPref } from "@/lib/hooks/useSyncedPref";
import { NUMBER_FORMAT_OPTIONS } from "@/core/domain/preferences/types";
import { SettingsOptionList } from "@/screens/settings/components/SettingsOptionList";

/** Number format picker (comma-dot, dot-comma, …), aligned with upstream. */
export function NumberFormatScreen() {
  const { t } = useTranslation("settings");
  const [numberFormat, setNumberFormat] = useSyncedPref("numberFormat");
  const [hideFraction] = useSyncedPref("hideFraction");
  const noFraction = hideFraction === "true";

  const options = NUMBER_FORMAT_OPTIONS.map((o) => ({
    value: o.value,
    label: noFraction ? o.labelNoFraction : o.label,
  }));

  return (
    <SettingsOptionList
      title={t("numberFormat")}
      options={options}
      value={numberFormat || "comma-dot"}
      onSelect={(v) => void setNumberFormat(v)}
    />
  );
}
