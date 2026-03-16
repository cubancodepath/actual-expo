import { Stack } from "expo-router";
import { useTranslation } from "react-i18next";
import { useTheme } from "@/presentation/providers/ThemeProvider";

export default function AccountsStack() {
  const { colors } = useTheme();
  const { t } = useTranslation("accounts");

  return (
    <Stack
      screenOptions={{
        headerTintColor: colors.headerText,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.pageBackground },
      }}
    >
      <Stack.Screen name="index" options={{ title: t("title") }} />
    </Stack>
  );
}
