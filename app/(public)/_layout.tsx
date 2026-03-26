import { Stack } from "expo-router";
import { usePrefsStore } from "@/stores/prefsStore";

export default function PublicLayout() {
  const hasSeenOnboarding = usePrefsStore((s) => s.hasSeenOnboarding);

  return (
    <Stack>
      <Stack.Protected guard={!hasSeenOnboarding}>
        <Stack.Screen name="onboarding" options={{ headerShown: false, animation: "fade" }} />
      </Stack.Protected>
      <Stack.Screen name="index" options={{ headerShown: false, animation: "fade" }} />
      <Stack.Screen
        name="local-setup"
        options={{ headerShown: false, animation: "fade_from_bottom" }}
      />
      <Stack.Screen
        name="new-local-budget"
        options={{ headerShown: false, presentation: "modal" }}
      />
      <Stack.Screen
        name="design-system"
        options={{ title: "Design System", animation: "fade_from_bottom" }}
      />
    </Stack>
  );
}
