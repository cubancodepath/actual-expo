import { Text, View } from "react-native";
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
      <View className="flex-row items-center gap-2 py-2">
        <Spinner themeColor="accent" />
        <Text className="text-sm text-muted">{t("connecting")}</Text>
      </View>
    );
  }

  const config = {
    idle: { label: t("continue"), onPress: onProbe, isDisabled: false },
    password: { label: t("signIn"), onPress: onPasswordLogin, isDisabled: disabled || loading },
    openid: { label: t("signInWithOpenId"), onPress: onOpenIdLogin, isDisabled: loading },
  }[step] ?? { label: t("continue"), onPress: onProbe, isDisabled: false };

  return (
    <Button variant="primary" size="lg" onPress={config.onPress} isDisabled={config.isDisabled}>
      {loading ? <Spinner color={accentFg} /> : config.label}
    </Button>
  );
}
