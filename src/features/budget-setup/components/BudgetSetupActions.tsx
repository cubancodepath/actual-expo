import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Button, Spinner, useThemeColor } from "@/ui";

type BudgetSetupActionsProps = {
  canCreate: boolean;
  loading: boolean;
  onCreate: () => void;
};

export function BudgetSetupActions({ canCreate, loading, onCreate }: BudgetSetupActionsProps) {
  const { t } = useTranslation("setup");
  const accentFg = useThemeColor("accent-foreground");

  return (
    <View className="gap-3 mt-8">
      <Button variant="primary" size="lg" onPress={onCreate} isDisabled={!canCreate || loading}>
        {loading ? <Spinner color={accentFg} /> : t("create")}
      </Button>
      <Text className="text-xs text-muted text-center">{t("footer")}</Text>
    </View>
  );
}
