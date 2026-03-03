import type { NativeStackNavigationOptions } from "@react-navigation/native-stack";
import type { Theme } from "../../theme";

/** Default header styling from theme tokens. */
export function themedScreenOptions(theme: Theme): NativeStackNavigationOptions {
  return {
    headerStyle: { backgroundColor: theme.colors.headerBackground },
    headerTintColor: theme.colors.headerText,
    headerShadowVisible: false,
  };
}

/** Modal screen options (presentation: modal + themed header). */
export function themedModalOptions(theme: Theme): NativeStackNavigationOptions {
  return {
    ...themedScreenOptions(theme),
    presentation: "modal",
  };
}
