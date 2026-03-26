import { Text, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { useTranslation } from "react-i18next";
import { Button, Spinner, useThemeColor } from "@/ui";
import type { LoginStep } from "../hooks/useLogin";

type LoginActionButtonProps = {
  step: LoginStep;
  loading: boolean;
  disabled: boolean;
  onProbe: () => void;
  onPasswordLogin: () => void;
  onOpenIdLogin: () => void;
};

export function LoginActionButton({
  step,
  loading,
  disabled,
  onProbe,
  onPasswordLogin,
  onOpenIdLogin,
}: LoginActionButtonProps) {
  const { t } = useTranslation("auth");
  const accentFg = useThemeColor("accent-foreground");

  if (step === "probing") {
    return (
      <Animated.View
        entering={FadeIn.duration(150)}
        exiting={FadeOut.duration(100)}
        className="flex-row items-center justify-center gap-2"
        style={{ minHeight: 44 }}
      >
        <Spinner themeColor="accent" />
        <Text className="text-sm text-muted">{t("connecting")}</Text>
      </Animated.View>
    );
  }

  const config =
    step === "password"
      ? { label: t("signIn"), onPress: onPasswordLogin, isDisabled: disabled || loading }
      : step === "openid"
        ? { label: t("signInWithOpenId"), onPress: onOpenIdLogin, isDisabled: loading }
        : { label: t("continue"), onPress: onProbe, isDisabled: false };

  return (
    <Button variant="primary" size="lg" onPress={config.onPress} isDisabled={config.isDisabled}>
      {loading ? <Spinner color={accentFg} /> : <Button.Label>{config.label}</Button.Label>}
    </Button>
  );
}
