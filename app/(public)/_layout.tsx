import { Stack } from 'expo-router';
import { usePrefsStore } from '../../src/stores/prefsStore';

export default function PublicLayout() {
  const hasSeenOnboarding = usePrefsStore((s) => s.hasSeenOnboarding);

  return (
    <Stack>
      <Stack.Protected guard={!hasSeenOnboarding}>
        <Stack.Screen name="onboarding" options={{ headerShown: false, animation: 'fade' }} />
      </Stack.Protected>
      <Stack.Screen name="index" options={{ headerShown: false, animation: 'fade' }} />
      <Stack.Screen name="local-setup" options={{ headerShown: false, animation: 'fade_from_bottom' }} />
    </Stack>
  );
}
