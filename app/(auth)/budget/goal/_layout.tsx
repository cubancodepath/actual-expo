import { Redirect, Stack } from "expo-router";
import { useThemeColor } from "heroui-native";
import { useFeatureFlag } from "@/hooks/useFeatureFlag";
import { GoalAutomationsProvider } from "@/screens/budget/EditGoalsScreen/context/GoalAutomationsProvider";

/**
 * The Edit Goals stack — a card modal containing its own native stack
 * (list → editor → mode), same arrangement as the transaction modal, so
 * moving between the steps gets the platform push transition. The draft
 * lives in the provider, above the stack.
 *
 * The visual goal editor is the `goalTemplatesUIEnabled` sub-feature: all its
 * entry points are gated behind that flag, and this guard keeps the stack
 * unreachable by deep-link when it's off (goals still display + apply under the
 * parent `goalTemplatesEnabled`, authored via category-note directives).
 */
export default function GoalLayout() {
  const background = useThemeColor("background");
  const goalEditorEnabled = useFeatureFlag("goalTemplatesUIEnabled");

  if (!goalEditorEnabled) return <Redirect href="/(auth)/budget" />;

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
