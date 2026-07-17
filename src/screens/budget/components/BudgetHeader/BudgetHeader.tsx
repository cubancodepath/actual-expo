import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { Button, Menu, useThemeColor } from "heroui-native";
import {
  ArrowLeftRight,
  ChartNoAxesColumn,
  EyeOff,
  MoreHorizontal,
  Settings,
  SlidersHorizontal,
  Undo2,
} from "lucide-react-native";
import { MonthYearPicker } from "@/screens/budget/components/MonthYearPicker";
import { useBudgetMonth } from "@/screens/budget/hooks/useBudgetMonth";
import { noop } from "@/screens/budget/constants";

/**
 * Budget screen header (HeroUI Native): month selector on the left, actions on
 * the right. Only the month picker is functional for now — Edit Plan and the
 * overflow menu are visual placeholders to be wired in later steps.
 */
export function BudgetHeader() {
  const { t } = useTranslation("budget");
  const insets = useSafeAreaInsets();
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
        <Button isIconOnly variant="ghost" onPress={noop} accessibilityLabel={t("editBudget")}>
          <SlidersHorizontal size={20} color={foreground} />
        </Button>

        <Menu>
          <Menu.Trigger asChild>
            <Button isIconOnly variant="ghost">
              <MoreHorizontal size={20} color={foreground} />
            </Button>
          </Menu.Trigger>
          <Menu.Portal>
            <Menu.Overlay />
            <Menu.Content presentation="popover" width={220} placement="bottom" align="end">
              <Menu.Item className="gap-3" onPress={noop}>
                <ChartNoAxesColumn size={18} color={foreground} />
                <Menu.ItemTitle>{t("showProgress")}</Menu.ItemTitle>
              </Menu.Item>
              <Menu.Item className="gap-3" onPress={noop}>
                <Undo2 size={18} color={foreground} />
                <Menu.ItemTitle>{t("undo")}</Menu.ItemTitle>
              </Menu.Item>
              <Menu.Item className="gap-3" onPress={noop}>
                <EyeOff size={18} color={foreground} />
                <Menu.ItemTitle>{t("hideAmounts")}</Menu.ItemTitle>
              </Menu.Item>
              <Menu.Item className="gap-3" onPress={noop}>
                <ArrowLeftRight size={18} color={muted} />
                <Menu.ItemTitle>{t("switchBudget")}</Menu.ItemTitle>
              </Menu.Item>
              <Menu.Item className="gap-3" onPress={noop}>
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
