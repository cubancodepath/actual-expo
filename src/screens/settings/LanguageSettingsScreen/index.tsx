import { Fragment } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { ListGroup, Separator, Typography, useThemeColor } from "heroui-native";
import { Check } from "lucide-react-native";
import { ScreenHeader } from "@/ui/ScreenHeader";
import { useGlobalPref } from "@/lib/hooks/useGlobalPref";
import { availableLanguages, setI18NextLanguage } from "@/i18n/config";
import { useSurfaceLevel } from "@/ui/surface-level";

// Native display names when the JS engine lacks Intl.DisplayNames (Hermes).
const NATIVE_NAME_FALLBACK: Record<string, string> = { en: "English", es: "Español" };

/** A locale's own native name (upstream uses Intl.DisplayNames; fall back to a
 *  small map, then the raw code, when DisplayNames isn't available). */
function nativeLanguageName(lang: string): string {
  try {
    return (
      new Intl.DisplayNames([lang], { type: "language" }).of(lang) ??
      NATIVE_NAME_FALLBACK[lang] ??
      lang
    );
  } catch {
    return NATIVE_NAME_FALLBACK[lang] ?? lang;
  }
}

/**
 * App language picker, aligned with upstream: language is a GlobalPref ("" =
 * System default), the list is derived from `availableLanguages`, and each
 * locale is shown by its native name.
 */
export function LanguageSettingsScreen() {
  const { itemVariant } = useSurfaceLevel();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation("settings");
  const accent = useThemeColor("accent");

  const [language, setLanguage] = useGlobalPref("language");
  const current = language ?? "";

  const options = [
    { value: "", label: t("languageSystem") },
    ...availableLanguages.map((lang) => ({ value: lang, label: nativeLanguageName(lang) })),
  ];

  function handleSelect(value: string) {
    setLanguage(value);
    setI18NextLanguage(value);
  }

  return (
    <ScreenHeader.ScrollArea>
      <ScreenHeader.Body
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 32 }}
      >
        <View className="mb-6">
          <Typography className="mb-2 ml-2 text-sm font-medium text-muted">
            {t("language")}
          </Typography>
          <ListGroup variant={itemVariant}>
            {options.map((opt, index) => (
              <Fragment key={opt.value || "system"}>
                {index > 0 && <Separator className="mx-4" />}
                <ListGroup.Item onPress={() => handleSelect(opt.value)}>
                  <ListGroup.ItemContent>
                    <ListGroup.ItemTitle>{opt.label}</ListGroup.ItemTitle>
                  </ListGroup.ItemContent>
                  {current === opt.value && (
                    <ListGroup.ItemSuffix>
                      <Check size={20} color={accent} />
                    </ListGroup.ItemSuffix>
                  )}
                </ListGroup.Item>
              </Fragment>
            ))}
          </ListGroup>
        </View>
      </ScreenHeader.Body>

      <ScreenHeader.Floating>
        <View style={{ height: insets.top }} />
        <ScreenHeader>
          <ScreenHeader.Back />
          <ScreenHeader.Title>{t("language")}</ScreenHeader.Title>
        </ScreenHeader>
      </ScreenHeader.Floating>
    </ScreenHeader.ScrollArea>
  );
}
