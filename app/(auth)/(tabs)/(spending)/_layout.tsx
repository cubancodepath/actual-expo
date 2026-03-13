import { Stack } from "expo-router";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../../../src/presentation/providers/ThemeProvider";

export default function SpendingStack() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const title = t("spending.title");

  return (
    <Stack
      screenOptions={{
        headerTintColor: colors.headerText,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.pageBackground },
      }}
    >
      <Stack.Screen name="index" options={{ title }} />
      <Stack.Screen
        name="search"
        options={{
          title,
          headerStyle: { backgroundColor: colors.pageBackground },
          animation: "fade",
          animationDuration: 150,
          headerBackVisible: false,
          headerLeft: () => null,
        }}
      />
    </Stack>
  );
}
