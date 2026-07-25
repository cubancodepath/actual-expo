import { View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { Button, useThemeColor } from "heroui-native";
import { Plus } from "lucide-react-native";
import { signOut } from "@/stores/operations/users";
import { clearSwitchingFlag } from "@/core/server/sync";
import { ScreenHeader } from "@/ui/ScreenHeader";
import { dialog } from "@/ui/feedback/dialog/dialogStore";
import { BudgetFileList } from "@/screens/files/components/BudgetFileList";

/** Post-login landing screen: pick, manage or create a budget file. */
export function BudgetFilesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation("auth");
  const accent = useThemeColor("accent");

  async function handleLogout() {
    const ok = await dialog.confirm({
      title: t("logOut"),
      message: t("logOutMessage"),
      confirmLabel: t("logOut"),
      destructive: true,
    });
    if (!ok) return;
    // signOut() is the full teardown (budget close + store resets + session).
    await signOut();
    clearSwitchingFlag();
    router.replace("/");
  }

  return (
    <BudgetFileList
      showDetachedAlert
      onSelect={(_file, select) => void select()}
      emptyExtra={
        <Button
          variant="primary"
          className="mt-4"
          onPress={() => router.push("/(files)/new-budget")}
        >
          <Button.Label>{t("createNewBudget")}</Button.Label>
        </Button>
      }
      header={
        <>
          <View style={{ height: insets.top }} />
          <ScreenHeader>
            <ScreenHeader.Back>
              <Button onPress={handleLogout} variant="tertiary">
                {t("logOut")}
              </Button>
            </ScreenHeader.Back>
            <ScreenHeader.Title>{t("openBudget")}</ScreenHeader.Title>
            <ScreenHeader.Actions>
              <Button
                variant="secondary"
                isIconOnly
                onPress={() => router.push("/(files)/new-budget")}
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
