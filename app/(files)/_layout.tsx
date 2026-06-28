import { Stack } from "expo-router";
import { useTranslation } from "react-i18next";
import { useTheme } from "@/design-system/providers/ThemeProvider";
import { themedScreenOptions } from "@/shared/navigation/screenOptions";
import { EncryptionPasswordPrompt } from "@/design-system";

export default function FilesLayout() {
  const theme = useTheme();
  const { t } = useTranslation("auth");

  return (
    <>
      <Stack screenOptions={themedScreenOptions(theme)}>
        <Stack.Screen name="files" options={{ headerShown: false }} />
        <Stack.Screen name="new-budget" options={{ headerShown: false }} />
      </Stack>
      <EncryptionPasswordPrompt />
    </>
  );
}
