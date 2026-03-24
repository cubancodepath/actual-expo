import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { getLocales } from "expo-localization";
import { createMMKV } from "react-native-mmkv";
import en from "./locales/en";
import es from "./locales/es";

const SUPPORTED_LANGUAGES = ["en", "es"] as const;

// Read stored language preference synchronously from MMKV (same store as prefsStore)
const mmkv = createMMKV({ id: "actual-prefs" });
const stored = mmkv.getString("actual-prefs");
const prefs = stored ? JSON.parse(stored) : {};
const deviceLocale = getLocales()[0]?.languageCode ?? "en";
const langPref: string = prefs.state?.language ?? "system";
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
