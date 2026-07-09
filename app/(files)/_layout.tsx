import { Stack } from "expo-router";

export default function FilesLayout() {
  return (
    <Stack>
      {/* files declares its own native header via <Stack.Screen options> in the screen */}
      <Stack.Screen name="files" options={{ headerShown: false }} />
      <Stack.Screen name="new-budget" options={{ headerShown: false }} />
    </Stack>
  );
}
