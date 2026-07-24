import { View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { Button, useThemeColor } from "heroui-native";
import { Plus } from "lucide-react-native";
import { useBudgetContextStore } from "@/stores/budgetContextStore";
import { ScreenHeader } from "@/ui/ScreenHeader";
import { BudgetFileList } from "@/screens/files/components/BudgetFileList";

/** In-app budget switcher, pushed inside the settings stack. */
export function ChangeBudgetScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const accent = useThemeColor("accent");
  const activeBudgetId = useBudgetContextStore((s) => s.activeBudgetId);

  return (
    <BudgetFileList
      activeBudgetId={activeBudgetId}
      lockScrollWhileSwitching
      onSelect={(file, select) => {
        // Tapping the already-open budget just backs out; otherwise switch and
        // land back on the main app once the new budget is open. dismissAll()
        // is NOT enough here: it only unwinds the nested settings stack to its
        // index, leaving the settings fullScreenModal mounted — dismissTo the
        // tabs pops the whole settings presentation too.
        if (file.localId && file.localId === activeBudgetId) {
          router.back();
          return;
        }
        void select().then((switched) => {
          if (switched) router.dismissTo("/(auth)/(tabs)");
        });
      }}
      header={
        <>
          <View style={{ height: insets.top }} />
          <ScreenHeader>
            <ScreenHeader.Back />
            <ScreenHeader.Title>{t("nav.switchBudget")}</ScreenHeader.Title>
            <ScreenHeader.Actions>
              <Button
                variant="tertiary"
                isIconOnly
                onPress={() => router.push("/(auth)/new-budget")}
              >
                <Plus color={accent} />
              </Button>
            </ScreenHeader.Actions>
          </ScreenHeader>
        </>
      }
    />
  );
}
