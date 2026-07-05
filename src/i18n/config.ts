import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { getLocales } from "expo-localization";
import { createMMKV } from "react-native-mmkv";
import en from "../locales/en";
import es from "../locales/es";

const SUPPORTED_LANGUAGES = ["en", "es"] as const;

// Read stored language preference synchronously from MMKV. Runs at import time,
// before the store migration in bootstrap, so it checks the new "ui-prefs" key
// first and falls back to the legacy "actual-prefs" blob for a not-yet-migrated
// upgrade.
const mmkv = createMMKV({ id: "actual-prefs" });
function readStoredLanguage(): string {
  for (const key of ["ui-prefs", "actual-prefs"]) {
    const raw = mmkv.getString(key);
    if (!raw) continue;
    try {
      const lang = JSON.parse(raw)?.state?.language;
      if (lang) return lang;
    } catch {
      // ignore malformed blob, try the next key
    }
  }
  return "system";
}
const deviceLocale = getLocales()[0]?.languageCode ?? "en";
const langPref: string = readStoredLanguage();
const resolved = langPref === "system" ? deviceLocale : langPref;
const lng = (SUPPORTED_LANGUAGES as readonly string[]).includes(resolved) ? resolved : "en";

i18n.use(initReactI18next).init({
  lng,
  fallbackLng: "en",
  defaultNS: "common",
  resources: { en, es },
  interpolation: { escapeValue: false },
  initImmediate: false,
});

export default i18n;
