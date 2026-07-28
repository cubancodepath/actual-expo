import { Stack } from "expo-router";
import { useStackOptions } from "@/lib/hooks/useStackOptions";

export default function FilesLayout() {
  const { screen } = useStackOptions();

  return (
    <Stack screenOptions={screen}>
      {/* files declares its own native header via <Stack.Screen options> in the screen */}
      <Stack.Screen name="files" options={{ headerShown: false }} />
      {/* Same signature as (auth)/new-budget and the settings stack: creating a
          budget swaps the whole app's data, so it presents full-screen. */}
      <Stack.Screen
        name="new-budget"
        options={{ ...screen, headerShown: false, presentation: "fullScreenModal" }}
      />
    </Stack>
  );
}
