import { Stack } from "expo-router";
import { useTranslation } from "react-i18next";
import { useTheme } from "@/presentation/providers/ThemeProvider";

export default function ReportsStack() {
  const { colors } = useTheme();
  const { t } = useTranslation();

  return (
    <Stack
      screenOptions={{
        headerTintColor: colors.headerText,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.pageBackground },
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          title: t("tabs.reports"),
        }}
      />
    </Stack>
  );
}
