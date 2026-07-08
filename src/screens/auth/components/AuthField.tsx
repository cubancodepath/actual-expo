import type { ComponentProps } from "react";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { withUniwind } from "uniwind";
import { Input, Label, TextField } from "heroui-native";

const StyledIonicons = withUniwind(Ionicons);

type AuthFieldProps = {
  label: string;
  icon: ComponentProps<typeof Ionicons>["name"];
} & Omit<ComponentProps<typeof Input>, "className">;

/** TextField with a leading icon inside the input — the single-field pattern of the auth screens. */
export function AuthField({ label, icon, ...inputProps }: AuthFieldProps) {
  return (
    <TextField>
      <Label>{label}</Label>
      <View className="w-full flex-row items-center">
        <Input {...inputProps} className="flex-1 pl-10" />
        <StyledIonicons
          name={icon}
          size={16}
          className="absolute left-3.5 text-muted"
          pointerEvents="none"
        />
      </View>
    </TextField>
  );
}
