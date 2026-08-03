import { Stack } from "expo-router";
import { useTranslation } from "react-i18next";
import { pickerHeaderOptions, TRANSLUCENT_HEADER_OPTIONS } from "@/lib/hooks/screenHeaderOptions";
import { useStackOptions } from "@/lib/hooks/useStackOptions";

export default function SpendingStack() {
  const { screen } = useStackOptions();
  const { t } = useTranslation("transactions");

  return (
    <Stack screenOptions={screen}>
      {/* Translucent like the pickers and the budget screens — the list scrolls
          under the bar and the system paints glass behind it. A plain title, no
          large one: that needs the scrollable to own the top INSET, which the
          virtualized list can't read. The shell pads for the bar instead. */}
      <Stack.Screen
        name="index"
        options={{ ...TRANSLUCENT_HEADER_OPTIONS, title: t("list.title") }}
      />
      {/* The picker recipe, which is the search-bar configuration this app has
          working: translucent bar with the field's geometry seeded here. The
          screen sets its own title and hides the back button — the field's own
          Cancel is the way out. */}
      <Stack.Screen
        name="search"
        options={{ ...pickerHeaderOptions("stacked"), animation: "fade", animationDuration: 150 }}
      />
    </Stack>
  );
}
