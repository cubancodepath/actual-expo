import { Image, Text, View } from "react-native";
import Constants from "expo-constants";
import { useTranslation } from "react-i18next";

export function LoginHero() {
  const { t } = useTranslation("auth");

  return (
    <View className="items-center mb-12">
      <Image
        source={require("../../../../assets/splash-icon.png")}
        style={{ width: 100, height: 100, resizeMode: "contain" }}
      />
      <Text className="text-3xl font-bold text-accent mt-2">
        {Constants.expoConfig?.name ?? "Actual"}
      </Text>
      <Text className="text-sm text-muted mt-1">{t("tagline")}</Text>
    </View>
  );
}
