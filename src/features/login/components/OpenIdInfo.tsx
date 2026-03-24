import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Icon } from "@/ui";

export function OpenIdInfo() {
  const { t } = useTranslation("auth");

  return (
    <View className="flex-row items-center gap-3 bg-accent/10 rounded-md p-3">
      <Icon name="Globe" size={20} themeColor="accent" />
      <Text className="text-sm text-foreground flex-1">{t("openIdRedirect")}</Text>
    </View>
  );
}
