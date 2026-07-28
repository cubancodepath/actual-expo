import { Stack } from "expo-router";
import { useThemeColor } from "heroui-native";
import { useStackOptions } from "@/lib/hooks/useStackOptions";

export default function PublicLayout() {
  const foreground = useThemeColor("foreground");
  const { screen } = useStackOptions();

  // Native minimal chevron floating over the screen content (fitness-app template pattern).
  const backChevron = {
    headerShown: true,
    headerTransparent: true,
    headerTitle: "",
    headerBackButtonDisplayMode: "minimal" as const,
    headerTintColor: foreground,
  };

  return (
    <Stack screenOptions={screen}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="password" options={backChevron} />
      <Stack.Screen name="openid" options={backChevron} />
      <Stack.Screen name="local-setup" options={backChevron} />
    </Stack>
  );
}
