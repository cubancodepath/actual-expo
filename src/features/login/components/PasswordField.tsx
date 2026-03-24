import { useTranslation } from "react-i18next";
import { TextField, Input, Label, FieldError } from "@/ui";

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

  return (
    <TextField isInvalid={isInvalid}>
      <Label>{t("password")}</Label>
      <Input
        testID="password-input"
        placeholder={t("passwordPlaceholder")}
        value={value}
        onChangeText={onChange}
        secureTextEntry
        autoCapitalize="none"
        autoFocus
        returnKeyType="go"
        onSubmitEditing={onSubmit}
        className="rounded-md"
      />
      {isInvalid && errorMessage && <FieldError>{errorMessage}</FieldError>}
    </TextField>
  );
}
