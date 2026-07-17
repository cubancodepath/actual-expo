import { Stack } from "expo-router";
import { useThemeColor } from "heroui-native";
import { GoalAutomationsProvider } from "@/screens/budget/EditGoalsScreen/context/GoalAutomationsProvider";

/**
 * The Edit Goals stack — a card modal containing its own native stack
 * (list → editor → mode), same arrangement as the transaction modal, so
 * moving between the steps gets the platform push transition. The draft
 * lives in the provider, above the stack.
 */
export default function GoalLayout() {
  const background = useThemeColor("background");

  return (
    <GoalAutomationsProvider>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: background },
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="editor" />
        <Stack.Screen name="mode" />
      </Stack>
    </GoalAutomationsProvider>
  );
}
