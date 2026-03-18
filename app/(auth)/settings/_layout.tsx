import { Stack, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useTheme } from "@/presentation/providers/ThemeProvider";
import { themedScreenOptions } from "@/presentation/navigation/screenOptions";
import { Button, EncryptionPasswordPrompt } from "@/presentation/components";

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
              <Button
                icon="close"
                buttonStyle="borderless"
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
