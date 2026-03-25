import { Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useTranslation } from "react-i18next";
import { ActualLogo } from "@/ui";

export function BudgetSetupHero() {
  const { t } = useTranslation("setup");

  return (
    <View className="items-center mb-8">
      <Animated.View entering={FadeInDown.duration(300).delay(100)}>
        <ActualLogo size={56} />
      </Animated.View>
      <Animated.Text
        entering={FadeInDown.duration(300).delay(200)}
        className="text-2xl font-bold text-foreground text-center mt-3"
      >
        {t("heading")}
      </Animated.Text>
      <Animated.Text
        entering={FadeInDown.duration(300).delay(300)}
        className="text-sm text-muted text-center mt-1"
      >
        {t("subtext")}
      </Animated.Text>
    </View>
  );
}
