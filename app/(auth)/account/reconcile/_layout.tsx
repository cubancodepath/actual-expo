import { Stack } from "expo-router";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../../../src/presentation/providers/ThemeProvider";
import { themedScreenOptions } from "../../../../src/presentation/navigation/screenOptions";

export default function ReconcileLayout() {
  const theme = useTheme();
  const screen = themedScreenOptions(theme);
  const { t } = useTranslation("accounts");

  return (
    <Stack screenOptions={{ ...screen, headerBackButtonDisplayMode: "minimal" }}>
      <Stack.Screen name="index" options={{ title: t("reconcile.title") }} />
      <Stack.Screen name="amount" options={{ title: t("reconcile.enterBankBalance") }} />
    </Stack>
  );
}
