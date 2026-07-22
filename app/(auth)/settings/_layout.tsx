import { Stack } from "expo-router";
import { useTranslation } from "react-i18next";
import { useTheme } from "@/design-system/providers/ThemeProvider";
import { themedScreenOptions } from "@/lib/screenOptions";

export default function SettingsLayout() {
  const theme = useTheme();
  const screen = themedScreenOptions(theme);
  const { t } = useTranslation("settings");

  return (
    <Stack screenOptions={{ ...screen, headerBackButtonDisplayMode: "minimal" }}>
      {/* Migrated to HeroUI — each screen renders its own ScreenHeader. */}
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="display" options={{ headerShown: false }} />
      <Stack.Screen name="language" options={{ headerShown: false }} />
      {/* Still legacy — keeps the native themed header. */}
      <Stack.Screen name="budget" options={{ title: t("budgetSettings") }} />
    </Stack>
  );
}
