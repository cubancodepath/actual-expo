import { Stack } from "expo-router";
import { useTheme } from "@/presentation/providers/ThemeProvider";
import { themedScreenOptions, themedModalOptions } from "@/presentation/navigation/screenOptions";
import { useTranslation } from "react-i18next";

export default function BankSyncLayout() {
  const theme = useTheme();
  const screen = themedScreenOptions(theme);
  const modal = themedModalOptions(theme);
  const { t } = useTranslation("bankSync");

  return (
    <Stack screenOptions={screen}>
      <Stack.Screen name="provider" options={{ title: t("provider.title"), ...modal }} />
      <Stack.Screen name="country" options={{ title: t("country.title") }} />
      <Stack.Screen name="institution" options={{ title: t("institution.title") }} />
      <Stack.Screen name="consent" options={{ title: t("consent.title") }} />
      <Stack.Screen name="accounts" options={{ title: t("accounts.title") }} />
      <Stack.Screen name="link-account" options={{ title: t("linkAccount.title") }} />
      <Stack.Screen name="simplefin-accounts" options={{ title: t("simplefin.title") }} />
    </Stack>
  );
}
