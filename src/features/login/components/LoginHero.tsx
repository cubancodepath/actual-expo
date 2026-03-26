import { Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import Constants from "expo-constants";
import { useTranslation } from "react-i18next";
import { ActualLogo } from "@/ui";

export function LoginHero() {
  const { t } = useTranslation("auth");

  return (
    <View className="items-center mb-12 gap-1">
      <Animated.View entering={FadeInDown.duration(300).delay(100)}>
        <ActualLogo size={72} />
      </Animated.View>
      <Animated.Text
        entering={FadeInDown.duration(300).delay(200)}
        className="text-3xl font-bold text-accent"
      >
        {Constants.expoConfig?.name ?? "Actual"}
      </Animated.Text>
      <Animated.Text entering={FadeInDown.duration(300).delay(300)} className="text-sm text-muted">
        {t("tagline")}
      </Animated.Text>
    </View>
  );
}
