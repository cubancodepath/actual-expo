import { useState } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { Button, Icon, TextField, Input, Label, FieldError } from "@/ui";

type PasswordFieldProps = {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  isInvalid: boolean;
  errorMessage?: string;
};

export function PasswordField({
  value,
  onChange,
  onSubmit,
  isInvalid,
  errorMessage,
}: PasswordFieldProps) {
  const { t } = useTranslation("auth");
  const [visible, setVisible] = useState(false);

  return (
    <TextField isInvalid={isInvalid}>
      <Label>{t("password")}</Label>
      <View className="flex-row items-center">
        <Input
          testID="password-input"
          placeholder={t("passwordPlaceholder")}
          value={value}
          onChangeText={onChange}
          secureTextEntry={!visible}
          autoCapitalize="none"
          autoFocus
          returnKeyType="go"
          onSubmitEditing={onSubmit}
          className="flex-1 rounded-md pr-12"
        />
        <View className="absolute right-1">
          <Button
            variant="ghost"
            size="sm"
            feedbackVariant="none"
            isIconOnly
            onPress={() => setVisible((v) => !v)}
          >
            <Icon name={visible ? "EyeOff" : "Eye"} size={18} themeColor="muted" />
          </Button>
        </View>
      </View>
      {isInvalid && errorMessage && <FieldError>{errorMessage}</FieldError>}
    </TextField>
  );
}
