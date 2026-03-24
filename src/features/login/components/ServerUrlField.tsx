import { Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { TextField, Input, Label, FieldError } from "@/ui";

type ServerUrlFieldProps = {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  isLocked: boolean;
  onChangeServer: () => void;
  isInvalid: boolean;
  errorMessage?: string;
};

export function ServerUrlField({
  value,
  onChange,
  onSubmit,
  isLocked,
  onChangeServer,
  isInvalid,
  errorMessage,
}: ServerUrlFieldProps) {
  const { t } = useTranslation("auth");

  return (
    <TextField isInvalid={isInvalid}>
      <Label>{t("serverUrl")}</Label>
      <View className="flex-row items-center gap-2">
        <View className="flex-1">
          <Input
            testID="server-url-input"
            placeholder={t("serverUrlPlaceholder")}
            value={value}
            onChangeText={onChange}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            returnKeyType="go"
            onSubmitEditing={!isLocked ? onSubmit : undefined}
            editable={!isLocked}
            className="rounded-md"
          />
        </View>
        {isLocked && (
          <Pressable onPress={onChangeServer} hitSlop={8}>
            <Text className="text-accent text-sm font-semibold">{t("change")}</Text>
          </Pressable>
        )}
      </View>
      {isInvalid && errorMessage && <FieldError>{errorMessage}</FieldError>}
    </TextField>
  );
}
