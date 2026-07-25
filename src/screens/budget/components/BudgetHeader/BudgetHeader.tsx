import { View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { Button, Menu, useThemeColor } from "heroui-native";
import {
  ChartNoAxesColumn,
  Eye,
  EyeOff,
  MoreHorizontal,
  NotebookPen,
  Settings,
  SlidersHorizontal,
  Undo2,
} from "lucide-react-native";
import { usePrivacyMode } from "@/lib/hooks/usePrivacyMode";
import { MonthYearPicker } from "@/screens/budget/components/MonthYearPicker";
import { useBudgetMonth } from "@/screens/budget/hooks/useBudgetMonth";
import { noop } from "@/screens/budget/constants";

/**
 * Budget screen header (HeroUI Native): month selector on the left, actions on
 * the right. The month picker and Edit Plan are wired; the overflow menu's Undo
 * is still a visual placeholder.
 */
export function BudgetHeader() {
  const { t } = useTranslation("budget");
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [privacyMode, togglePrivacy] = usePrivacyMode();
  const foreground = useThemeColor("foreground");
  const muted = useThemeColor("muted");
  const { month, setMonth } = useBudgetMonth();

  return (
    <View
      className="flex-row items-center justify-between px-4 pb-2"
      style={{ paddingTop: insets.top + 4 }}
    >
      <MonthYearPicker value={month} onChange={setMonth} />

      <View className="flex-row items-center gap-1">
        <Button
          isIconOnly
          variant="tertiary"
          onPress={() => router.push("/(auth)/budget/edit")}
          accessibilityLabel={t("editBudget")}
        >
          <NotebookPen size={20} color={foreground} />
        </Button>

        <Menu>
          <Menu.Trigger asChild>
            <Button isIconOnly variant="tertiary">
              <MoreHorizontal size={20} color={foreground} />
            </Button>
          </Menu.Trigger>
          <Menu.Portal>
            <Menu.Overlay />
            <Menu.Content presentation="popover" width={220} placement="bottom" align="end">
              <Menu.Item className="gap-3" onPress={noop}>
                <Undo2 size={18} color={foreground} />
                <Menu.ItemTitle>{t("undo")}</Menu.ItemTitle>
              </Menu.Item>
              <Menu.Item className="gap-3" onPress={togglePrivacy}>
                {privacyMode ? (
                  <Eye size={18} color={foreground} />
                ) : (
                  <EyeOff size={18} color={foreground} />
                )}
                <Menu.ItemTitle>{privacyMode ? t("showAmounts") : t("hideAmounts")}</Menu.ItemTitle>
              </Menu.Item>
              <Menu.Item className="gap-3" onPress={() => router.push("/(auth)/settings")}>
                <Settings size={18} color={muted} />
                <Menu.ItemTitle>{t("settings")}</Menu.ItemTitle>
              </Menu.Item>
            </Menu.Content>
          </Menu.Portal>
        </Menu>
      </View>
    </View>
  );
}
