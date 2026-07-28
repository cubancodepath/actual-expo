import { Stack } from "expo-router";

export default function SpendingStack() {
  return (
    <Stack>
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
