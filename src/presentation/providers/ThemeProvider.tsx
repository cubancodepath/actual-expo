import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import { useColorScheme, StyleSheet } from "react-native";
import { lightTheme, darkTheme, type Theme } from "../../theme";

// ── Context ───────────────────────────────────────────────────────────────────

const ThemeContext = createContext<Theme>(lightTheme);

// ── Provider ──────────────────────────────────────────────────────────────────

export function ThemeProvider({ children }: { children: ReactNode }) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === "dark" ? darkTheme : lightTheme;

  return (
    <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>
  );
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

/** Returns the active theme object. */
export function useTheme(): Theme {
  return useContext(ThemeContext);
}

/**
 * Creates themed styles that automatically update when the theme changes.
 *
 * @example
 * function MyComponent() {
 *   const styles = useThemedStyles((theme) => ({
 *     container: { backgroundColor: theme.colors.pageBackground },
 *     title: { ...theme.typography.headingLg, color: theme.colors.textPrimary },
 *   }));
 *   return <View style={styles.container}><Text style={styles.title}>Hello</Text></View>;
 * }
 */
export function useThemedStyles<T extends StyleSheet.NamedStyles<T>>(
  createStyles: (theme: Theme) => T,
): T {
  const theme = useTheme();
  return useMemo(() => StyleSheet.create(createStyles(theme)), [theme]);
}
