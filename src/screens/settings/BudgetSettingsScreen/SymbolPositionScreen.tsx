import { useTranslation } from "react-i18next";
import { useSyncedPref } from "@/lib/hooks/useSyncedPref";
import { getCurrency } from "@/core/shared/currencies";
import { SettingsOptionList } from "@/screens/settings/components/SettingsOptionList";

/** Currency symbol position (before/after the amount), with a live example. */
export function SymbolPositionScreen() {
  const { t } = useTranslation("settings");
  const [position, setPosition] = useSyncedPref("currencySymbolPosition");
  const [code] = useSyncedPref("defaultCurrencyCode");
  const [space] = useSyncedPref("currencySpaceBetweenAmountAndSymbol");

  const symbol = getCurrency(code || "").symbol || "$";
  const gap = space === "true" ? " " : "";

  const options = [
    { value: "before", label: t("positionBefore"), description: `${symbol}${gap}100` },
    { value: "after", label: t("positionAfter"), description: `100${gap}${symbol}` },
  ];

  return (
    <SettingsOptionList
      title={t("symbolPosition")}
      options={options}
      value={position || "before"}
      onSelect={(v) => void setPosition(v)}
    />
  );
}
