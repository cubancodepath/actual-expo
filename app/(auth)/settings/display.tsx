import { ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme, useThemedStyles } from "../../../src/presentation/providers/ThemeProvider";
import {
  Card,
  ListItem,
  SectionHeader,
} from "../../../src/presentation/components";
import { usePrefsStore } from "../../../src/stores/prefsStore";
import type { Theme } from "../../../src/theme";

const THEME_OPTIONS = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
] as const;

export default function DisplaySettingsScreen() {
  const { spacing } = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();

  const themeMode = usePrefsStore((s) => s.themeMode);
  const setPrefs = usePrefsStore((s) => s.setPrefs);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }}
      contentInsetAdjustmentBehavior="automatic"
    >
      <SectionHeader title="Theme" style={{ marginTop: spacing.lg }} />
      <Card>
        {THEME_OPTIONS.map((opt, index) => (
          <ListItem
            key={opt.value}
            title={opt.label}
            onPress={() => setPrefs({ themeMode: opt.value })}
            checkmark={themeMode === opt.value}
            showSeparator={index < THEME_OPTIONS.length - 1}
          />
        ))}
      </Card>
    </ScrollView>
  );
}

const createStyles = (theme: Theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.pageBackground,
    paddingHorizontal: theme.spacing.lg,
  },
});
