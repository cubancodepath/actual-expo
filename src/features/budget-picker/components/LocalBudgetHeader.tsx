import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { Button, Icon } from "@/ui";

type LocalBudgetHeaderProps = {
  onBack: () => void;
  onNew: () => void;
};

export function LocalBudgetHeader({ onBack, onNew }: LocalBudgetHeaderProps) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation("auth");
  const { t: tc } = useTranslation("common");

  return (
    <View
      className="flex-row items-center justify-between px-6 pb-6"
      style={{ paddingTop: insets.top + 8 }}
    >
      <Button variant="ghost" size="sm" feedbackVariant="none" onPress={onBack}>
        <Icon name="ChevronLeft" size={18} themeColor="muted" />
        <Button.Label className="text-muted">{tc("back")}</Button.Label>
      </Button>
      <Text className="text-xl font-bold text-foreground">{t("yourBudgets")}</Text>
      <Button variant="ghost" size="sm" onPress={onNew}>
        <Icon name="Plus" size={18} themeColor="accent" />
        <Button.Label className="text-accent">{t("new")}</Button.Label>
      </Button>
    </View>
  );
}
