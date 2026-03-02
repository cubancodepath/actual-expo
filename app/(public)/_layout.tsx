import { Stack } from 'expo-router';

export default function PublicLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Connect to server', headerShown: false }} />
      <Stack.Screen name="files" options={{ title: 'Select budget', headerBackTitle: 'Back' }} />
    </Stack>
  );
}
