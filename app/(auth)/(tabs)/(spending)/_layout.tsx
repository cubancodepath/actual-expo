import { Stack } from "expo-router";
import { useStackOptions } from "@/lib/hooks/useStackOptions";

export default function SpendingStack() {
  const { screen } = useStackOptions();

  return (
    <Stack screenOptions={screen}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen
        name="search"
        options={{
          animation: "fade",
          animationDuration: 150,
          headerShown: false,
        }}
      />
    </Stack>
  );
}
