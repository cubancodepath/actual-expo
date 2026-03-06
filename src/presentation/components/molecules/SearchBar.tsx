import {
  TextInput,
  View,
  Pressable,
  StyleSheet,
  type TextInputProps,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../providers/ThemeProvider";

export interface SearchBarProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  noMargin?: boolean;
  returnKeyType?: TextInputProps["returnKeyType"];
}

export function SearchBar({
  value,
  onChangeText,
  placeholder = "Search...",
  autoFocus,
  noMargin,
  returnKeyType,
}: SearchBarProps) {
  const { colors, spacing, borderRadius: br } = useTheme();

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.inputBackground,
          borderColor: colors.inputBorder,
          borderRadius: br.full,
          paddingHorizontal: spacing.md,
          ...(noMargin
            ? {}
            : {
                marginHorizontal: spacing.lg,
                marginVertical: spacing.sm,
              }),
        },
      ]}
    >
      <Ionicons name="search" size={18} color={colors.textMuted} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        style={[
          styles.input,
          { color: colors.textPrimary, marginLeft: spacing.sm },
        ]}
        autoCapitalize="none"
        autoCorrect={false}
        autoFocus={autoFocus}
        returnKeyType={returnKeyType}
      />
      {value.length > 0 && (
        <Pressable onPress={() => onChangeText("")} hitSlop={8}>
          <Ionicons name="close-circle" size={18} color={colors.textMuted} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    height: 40,
    borderWidth: 0,
  },
  input: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 0,
  },
});
