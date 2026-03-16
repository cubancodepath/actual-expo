import { TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme, useThemedStyles } from "../../providers/ThemeProvider";
import type { Theme } from "../../../theme";

interface NotesFieldProps {
  value: string;
  onChangeText: (text: string) => void;
}

export function NotesField({ value, onChangeText }: NotesFieldProps) {
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);

  return (
    <View style={styles.row}>
      <View style={styles.container}>
        <Ionicons
          name="document-text-outline"
          size={18}
          color={theme.colors.textMuted}
          style={{ marginTop: 2 }}
        />
        <TextInput
          style={styles.input}
          placeholder="Add a note..."
          placeholderTextColor={theme.colors.textMuted}
          value={value}
          onChangeText={onChangeText}
          multiline
          numberOfLines={3}
          textAlignVertical="top"
          blurOnSubmit
          returnKeyType="done"
        />
      </View>
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  row: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    minHeight: 44,
  },
  container: {
    flexDirection: "row" as const,
    alignItems: "flex-start" as const,
    flex: 1,
  },
  input: {
    flex: 1,
    color: theme.colors.textPrimary,
    fontSize: 16,
    marginLeft: theme.spacing.sm,
    padding: 0,
    minHeight: 60,
  },
});
