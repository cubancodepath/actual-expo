import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { getLocales } from "expo-localization";
import { createMMKV } from "react-native-mmkv";
import en from "./locales/en";
import es from "./locales/es";

const SUPPORTED_LANGUAGES = ["en", "es"] as const;

/**
 * Locales the app can display, derived from the translated resource bundles it
 * ships. Faithful to upstream's `availableLanguages`; grows automatically as
 * more `src/i18n/locales/<lang>` bundles are added. (Upstream ships many more
 * because Weblate translates its whole key set; expo only has en+es so far.)
 */
export const availableLanguages: readonly string[] = SUPPORTED_LANGUAGES;

function deviceLanguage(): string {
  return getLocales()[0]?.languageCode ?? "en";
}

/** Resolve a stored language preference ("" / null / "system" = device) to a supported locale. */
function resolveLanguage(language: string | null | undefined): string {
  const target = !language || language === "system" ? deviceLanguage() : language;
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(target) ? target : "en";
}

// Read the stored language preference synchronously at import time from the
// device-global prefs store (GlobalPrefs, key "language"; "" = system default).
const mmkv = createMMKV({ id: "actual-global" });
const langPref: string = mmkv.getString("language") ?? "";
const lng = resolveLanguage(langPref);

i18n.use(initReactI18next).init({
  lng,
  fallbackLng: "en",
  defaultNS: "common",
  resources: { en, es },
  interpolation: { escapeValue: false },
  initImmediate: false,
});

/**
 * Apply a language preference to i18next. `null`/`""`/`"system"` follow the
 * device locale. Mirrors upstream's `setI18NextLanguage`. Call alongside
 * persisting the pref (`useGlobalPref("language")`).
 */
export function setI18NextLanguage(language: string | null): void {
  const resolved = resolveLanguage(language);
  if (resolved !== i18n.language) void i18n.changeLanguage(resolved);
}

export default i18n;
