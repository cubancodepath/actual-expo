import { Stack } from "expo-router";
import { useTranslation } from "react-i18next";
import { useTheme } from "@/presentation/providers/ThemeProvider";
import { themedScreenOptions } from "@/presentation/navigation/screenOptions";
import { EncryptionPasswordPrompt } from "@/presentation/components";

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
