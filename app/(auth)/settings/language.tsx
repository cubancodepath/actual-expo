import { ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { getLocales } from "expo-localization";
import { useTheme, useThemedStyles } from "../../../src/presentation/providers/ThemeProvider";
import {
  Card,
  ListItem,
  SectionHeader,
} from "../../../src/presentation/components";
import { usePrefsStore } from "../../../src/stores/prefsStore";
import i18n from "../../../src/i18n/config";
import type { Theme } from "../../../src/theme";

const LANGUAGE_OPTIONS = [
  { value: 'system', labelKey: 'languageSystem' },
  { value: 'en', labelKey: 'languageEn' },
  { value: 'es', labelKey: 'languageEs' },
] as const;

function resolveLanguage(lang: string): string {
  if (lang === 'system') {
    const deviceLocale = getLocales()[0]?.languageCode ?? 'en';
    return ['en', 'es'].includes(deviceLocale) ? deviceLocale : 'en';
  }
  return lang;
}

export default function LanguageSettingsScreen() {
  const { spacing } = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const { t } = useTranslation('settings');

  const language = usePrefsStore((s) => s.language);
  const setLanguage = usePrefsStore((s) => s.setLanguage);

  function handleSelect(value: 'system' | 'en' | 'es') {
    setLanguage(value);
    i18n.changeLanguage(resolveLanguage(value));
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }}
      contentInsetAdjustmentBehavior="automatic"
    >
      <SectionHeader title={t('language')} style={{ marginTop: spacing.lg }} />
      <Card>
        {LANGUAGE_OPTIONS.map((opt, index) => (
          <ListItem
            key={opt.value}
            title={t(opt.labelKey)}
            onPress={() => handleSelect(opt.value)}
            checkmark={language === opt.value}
            showSeparator={index < LANGUAGE_OPTIONS.length - 1}
          />
        ))}
      </Card>
    </ScrollView>
  );
}

const createStyles = (theme: Theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.pageBackground,
    paddingHorizontal: theme.spacing.lg,
  },
});
