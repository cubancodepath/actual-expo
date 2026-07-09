import type { ComponentProps } from "react";
import { View } from "react-native";
import type { LucideIcon } from "lucide-react-native";
import { Input, Label, TextField, useThemeColor } from "heroui-native";

type AuthFieldProps = {
  label: string;
  icon: LucideIcon;
} & Omit<ComponentProps<typeof Input>, "className">;

/** TextField with a leading icon inside the input — the single-field pattern of the auth screens. */
export function AuthField({ label, icon: Icon, ...inputProps }: AuthFieldProps) {
  const muted = useThemeColor("muted");
  return (
    <TextField>
      <Label>{label}</Label>
      <View className="w-full flex-row items-center">
        <Input {...inputProps} className="flex-1 pl-10" />
        <Icon
          size={16}
          color={muted}
          style={{ position: "absolute", left: 14 }}
          pointerEvents="none"
        />
      </View>
    </TextField>
  );
}
