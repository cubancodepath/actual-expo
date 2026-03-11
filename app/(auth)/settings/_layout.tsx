import { Stack, useRouter } from "expo-router";
import { useTheme } from "../../../src/presentation/providers/ThemeProvider";
import { themedScreenOptions } from "../../../src/presentation/navigation/screenOptions";
import { IconButton } from "../../../src/presentation/components";

export default function SettingsLayout() {
  const theme = useTheme();
  const router = useRouter();
  const screen = themedScreenOptions(theme);

  return (
    <Stack screenOptions={screen}>
      <Stack.Screen
        name="index"
        options={{
          title: "Settings",
          headerLeft: () => (
            <IconButton
              sfSymbol="xmark"
              size={22}
              color={theme.colors.headerText}
              onPress={() => router.dismissAll()}
            />
          ),
        }}
      />
      <Stack.Screen name="budget" options={{ title: "Budget Settings" }} />
    </Stack>
  );
}
