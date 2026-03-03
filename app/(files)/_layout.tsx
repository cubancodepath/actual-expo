import { Stack } from 'expo-router';

export default function FilesLayout() {
  return (
    <Stack>
      <Stack.Screen name="files" options={{ headerShown: false }} />
    </Stack>
  );
}
