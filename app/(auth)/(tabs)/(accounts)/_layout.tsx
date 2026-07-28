import { Stack } from "expo-router";
import { useTranslation } from "react-i18next";
import { useStackOptions } from "@/lib/hooks/useStackOptions";

export default function AccountsStack() {
  const { screen } = useStackOptions();
  const { t } = useTranslation("accounts");

  return (
    <Stack screenOptions={screen}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
    </Stack>
  );
}
