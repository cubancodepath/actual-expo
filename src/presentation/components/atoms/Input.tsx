import { forwardRef } from "react";
import { StyleSheet, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from "react-native";
import { useTheme } from "../../providers/ThemeProvider";
import { Icon, type IconName } from "./Icon";

export interface InputProps extends TextInputProps {
  /** Icon displayed at the left edge of the input. */
  icon?: IconName;
  /** Show error border (red). */
  error?: boolean;
  /** Style applied to the outer container (margins, flex, etc.). */
  containerStyle?: StyleProp<ViewStyle>;
}

export const Input = forwardRef<TextInput, InputProps>(function Input(
  { icon, error, containerStyle, style, placeholderTextColor, ...rest },
  ref,
) {
  const { colors, spacing, borderRadius: br, borderWidth: bw } = useTheme();

  const baseContainer: ViewStyle = {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.inputBackground,
    borderRadius: br.full,
    borderWidth: bw.default,
    borderColor: error ? colors.errorText : colors.inputBorder,
    paddingHorizontal: spacing.md,
    minHeight: 48,
    gap: spacing.sm,
  };

  const containerStyles = containerStyle
    ? { ...baseContainer, ...StyleSheet.flatten(containerStyle) }
    : baseContainer;

  const inputStyles = {
    flex: 1,
    fontSize: 16,
    color: colors.textPrimary,
    paddingVertical: spacing.md,
  };

  return (
    <View style={containerStyles}>
      {icon && <Icon name={icon} size={18} color={colors.textMuted} />}
      <TextInput
        ref={ref}
        placeholderTextColor={placeholderTextColor ?? colors.textMuted}
        style={[inputStyles, style]}
        {...rest}
      />
    </View>
  );
});
