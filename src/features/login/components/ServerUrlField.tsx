import { View } from "react-native";
import Animated, { FadeInRight, FadeOutRight, LinearTransition } from "react-native-reanimated";
import { useTranslation } from "react-i18next";
import { Button, TextField, Input, Label, FieldError } from "@/ui";

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
        <Animated.View className="flex-1" layout={LinearTransition.duration(200)}>
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
        </Animated.View>
        {isLocked && (
          <Animated.View entering={FadeInRight.duration(200)} exiting={FadeOutRight.duration(150)}>
            <Button variant="ghost" size="sm" feedbackVariant="none" onPress={onChangeServer}>
              <Button.Label className="text-accent">{t("change")}</Button.Label>
            </Button>
          </Animated.View>
        )}
      </View>
      {isInvalid && errorMessage && <FieldError>{errorMessage}</FieldError>}
    </TextField>
  );
}
