import { Fragment } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { getLocales } from "expo-localization";
import { ListGroup, Separator, Typography, useThemeColor } from "heroui-native";
import { Check } from "lucide-react-native";
import { ScreenHeader } from "@/ui/ScreenHeader";
import { useUiPrefsStore } from "@/stores/uiPrefsStore";
import i18n from "@/i18n/config";

const LANGUAGE_OPTIONS = [
  { value: "system", labelKey: "languageSystem" },
  { value: "en", labelKey: "languageEn" },
  { value: "es", labelKey: "languageEs" },
] as const;

/** Resolve the effective i18n language for the stored preference. */
function resolveLanguage(lang: string): string {
  if (lang === "system") {
    const deviceLocale = getLocales()[0]?.languageCode ?? "en";
    return ["en", "es"].includes(deviceLocale) ? deviceLocale : "en";
  }
  return lang;
}

/** App language picker. HeroUI replacement for the legacy language screen. */
export function LanguageSettingsScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation("settings");
  const accent = useThemeColor("accent");

  const language = useUiPrefsStore((s) => s.language);
  const setLanguage = useUiPrefsStore((s) => s.setLanguage);

  function handleSelect(value: "system" | "en" | "es") {
    setLanguage(value);
    i18n.changeLanguage(resolveLanguage(value));
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
          <ListGroup>
            {LANGUAGE_OPTIONS.map((opt, index) => (
              <Fragment key={opt.value}>
                {index > 0 && <Separator className="mx-4" />}
                <ListGroup.Item onPress={() => handleSelect(opt.value)}>
                  <ListGroup.ItemContent>
                    <ListGroup.ItemTitle>{t(opt.labelKey)}</ListGroup.ItemTitle>
                  </ListGroup.ItemContent>
                  {language === opt.value && (
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
