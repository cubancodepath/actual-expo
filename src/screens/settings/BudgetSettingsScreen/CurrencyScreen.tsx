import { useTranslation } from "react-i18next";
import { useSyncedPref } from "@/lib/hooks/useSyncedPref";
import { currencies, getCurrency } from "@/core/shared/currencies";
import { SettingsOptionList } from "@/screens/settings/components/SettingsOptionList";

/**
 * Default-currency picker. Selecting a currency also configures number format,
 * hidden decimals and symbol placement from the currency's metadata — mirroring
 * upstream's `handleCurrencyChange` (settings/Currency.tsx).
 */
export function CurrencyScreen() {
  const { t } = useTranslation("settings");
  const [code, setCode] = useSyncedPref("defaultCurrencyCode");
  const [, setNumberFormat] = useSyncedPref("numberFormat");
  const [, setHideFraction] = useSyncedPref("hideFraction");
  const [, setSpace] = useSyncedPref("currencySpaceBetweenAmountAndSymbol");
  const [, setPosition] = useSyncedPref("currencySymbolPosition");

  const options = currencies.map((c) => ({
    value: c.code,
    label: c.code === "" ? t("currencyNone") : `${c.code} - ${c.name} (${c.symbol})`,
  }));

  const handleChange = (next: string) => {
    void setCode(next);
    if (next !== "") {
      const cur = getCurrency(next);
      void setNumberFormat(cur.numberFormat);
      void setHideFraction(cur.decimalPlaces === 0 ? "true" : "false");
      void setSpace(cur.symbolFirst ? "false" : "true");
      void setPosition(cur.symbolFirst ? "before" : "after");
    }
  };

  return (
    <SettingsOptionList
      title={t("defaultCurrency")}
      options={options}
      value={code || ""}
      onSelect={handleChange}
    />
  );
}
