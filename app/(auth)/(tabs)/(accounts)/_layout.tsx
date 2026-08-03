import { Stack } from "expo-router";
import { useTranslation } from "react-i18next";
import { TRANSLUCENT_HEADER_OPTIONS } from "@/lib/hooks/screenHeaderOptions";
import { useStackOptions } from "@/lib/hooks/useStackOptions";

export default function AccountsStack() {
  const { screen } = useStackOptions();
  const { t } = useTranslation("accounts");

  return (
    <Stack screenOptions={screen}>
      {/* Translucent like the other tab roots: the list scrolls under the bar
          and the system paints glass behind it. Title and actions are the
          native bar's now — the screen pads its own content for it. */}
      <Stack.Screen name="index" options={{ ...TRANSLUCENT_HEADER_OPTIONS, title: t("title") }} />
    </Stack>
  );
}
