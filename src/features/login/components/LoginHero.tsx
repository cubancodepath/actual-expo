import { Text, View } from "react-native";
import Constants from "expo-constants";
import { useTranslation } from "react-i18next";
import { ActualLogo } from "@/ui";

export function LoginHero() {
  const { t } = useTranslation("auth");

  return (
    <View className="items-center mb-12">
      <ActualLogo size={72} />
      <Text className="text-3xl font-bold text-accent mt-2">
        {Constants.expoConfig?.name ?? "Actual"}
      </Text>
      <Text className="text-sm text-muted mt-1">{t("tagline")}</Text>
    </View>
  );
}
