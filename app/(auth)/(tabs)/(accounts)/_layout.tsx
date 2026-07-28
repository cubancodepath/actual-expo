import { Stack } from "expo-router";
import { useStackOptions } from "@/lib/hooks/useStackOptions";

export default function AccountsStack() {
  const { screen } = useStackOptions();

  return (
    <Stack screenOptions={screen}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
    </Stack>
  );
}
