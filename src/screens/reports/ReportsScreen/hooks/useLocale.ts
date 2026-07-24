/**
 * useLocale — the date-fns `Locale` for the active app language, used by the
 * report spreadsheets for x-axis / tooltip date formatting (upstream threads a
 * `Locale` object the same way). Falls back to English.
 */
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { enUS, es, type Locale } from "date-fns/locale";

const LOCALES: Record<string, Locale> = { en: enUS, es };

export function useLocale(): Locale {
  const { i18n } = useTranslation();
  return useMemo(() => LOCALES[i18n.language] ?? enUS, [i18n.language]);
}
