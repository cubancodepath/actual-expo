import { Stack, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../../src/presentation/providers/ThemeProvider";
import { themedScreenOptions } from "../../../src/presentation/navigation/screenOptions";
import { IconButton, EncryptionPasswordPrompt } from "../../../src/presentation/components";

export default function SettingsLayout() {
  const theme = useTheme();
  const router = useRouter();
  const screen = themedScreenOptions(theme);
  const { t } = useTranslation("settings");

  return (
    <>
      <Stack screenOptions={{ ...screen, headerBackButtonDisplayMode: "minimal" }}>
        <Stack.Screen
          name="index"
          options={{
            title: t("title"),
            headerLeft: () => (
              <IconButton
                sfSymbol="xmark"
                size={22}
                color={theme.colors.headerText}
                onPress={() => router.dismissAll()}
              />
            ),
          }}
        />
        <Stack.Screen name="budget" options={{ title: t("budgetSettings") }} />
        <Stack.Screen name="display" options={{ title: t("display") }} />
        <Stack.Screen name="language" options={{ title: t("language") }} />
      </Stack>
      <EncryptionPasswordPrompt />
    </>
  );
}
