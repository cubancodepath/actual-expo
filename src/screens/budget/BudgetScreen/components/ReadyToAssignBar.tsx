import { View } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Chip, cn, Menu, PressableFeedback, useThemeColor } from "heroui-native";
import { Hourglass, PiggyBank, RotateCcw, Wallet } from "lucide-react-native";
import { useSheetValueNumber } from "@/hooks/useSheetValue";
import { envelopeBudget } from "@/core/domain/spreadsheet/bindings";
import { resetHold, resetIncomeCarryover } from "@/core/domain/budgets";
import { formatCents } from "@/core/shared/util";
import { dialog } from "@/ui/feedback/dialog";
import { Money } from "@/ui/Money";

interface ReadyToAssignBarProps {
  sheet: string;
  /** The month the bar acts on (hold/reset/assign all target it). */
  month: string;
  /** Navigate to the Assign Money modal (the menu's first action). */
  onPress?: () => void;
}

/**
 * The key budget indicator: how much is left to assign, or by how much you've
 * overbudgeted. Tapping it opens a small menu that mirrors desktop's To Budget
 * menu (assign / hold for next month / reset hold / disable auto hold — same
 * visibility rules). When money is held for next month a second, muted chip
 * appears next to it; tapping that releases the hold. Hidden entirely only when
 * nothing is assignable and nothing is held.
 */
export function ReadyToAssignBar({ sheet, month, onPress }: ReadyToAssignBarProps) {
  const { t } = useTranslation("budget");
  const router = useRouter();
  const muted = useThemeColor("muted");

  const toBudget = useSheetValueNumber(sheet, envelopeBudget.toBudget);
  const buffered = useSheetValueNumber(sheet, envelopeBudget.buffered); // manual hold
  const bufferedAuto = useSheetValueNumber(sheet, envelopeBudget.bufferedAuto);
  const bufferedSelected = useSheetValueNumber(sheet, envelopeBudget.bufferedSelected);

  if (toBudget === 0 && bufferedSelected === 0) return null;

  const positive = toBudget > 0;
  const color = positive ? "success" : "danger";
  const fg = positive ? "text-success-foreground" : "text-danger-foreground";

  const confirmRelease = async () => {
    const ok = await dialog.confirm({
      title: t("releaseHoldTitle"),
      message: t("releaseHoldMessage"),
      confirmLabel: t("releaseHoldTitle"),
    });
    if (!ok) return;
    // Manual holds reset to zero; an active auto hold is turned off wholesale.
    if (buffered !== 0) resetHold(month).catch(() => {});
    else resetIncomeCarryover(month).catch(() => {});
  };

  const openHold = () => {
    router.push({
      pathname: "/(auth)/budget/hold",
      params: { month, toBudget: String(toBudget) },
    });
  };

  return (
    <View className="gap-2">
      {toBudget !== 0 ? (
        <View className="w-full">
          <Menu presentation="bottom-sheet">
            {/* The Chip renders its own Pressable, so pointerEvents="none" lets the
              tap fall through to the Menu.Trigger which owns opening the menu. */}
            <Menu.Trigger className="w-full">
              <Chip
                variant="primary"
                color={color}
                size="lg"
                pointerEvents="none"
                className="w-full justify-between px-4 py-3"
              >
                <Money cents={toBudget} tone="plain" className={cn("text-xl font-bold", fg)} />
                <Chip.Label className={cn("text-sm font-medium", fg)}>
                  {t(positive ? "readyToAssign" : "overassigned")}
                </Chip.Label>
              </Chip>
            </Menu.Trigger>
            <Menu.Portal>
              <Menu.Overlay className="bg-black/50" />
              <Menu.Content presentation="bottom-sheet">
                <Menu.Item className="gap-3" onPress={onPress}>
                  <Wallet size={18} color={muted} />
                  <Menu.ItemTitle>{t("assignMoney")}</Menu.ItemTitle>
                </Menu.Item>
                {toBudget > 0 && bufferedAuto === 0 ? (
                  <Menu.Item className="gap-3" onPress={openHold}>
                    <Hourglass size={18} color={muted} />
                    <Menu.ItemTitle>{t("holdForNextMonth")}</Menu.ItemTitle>
                  </Menu.Item>
                ) : null}
                {buffered !== 0 ? (
                  <Menu.Item className="gap-3" onPress={confirmRelease}>
                    <RotateCcw size={18} color={muted} />
                    <Menu.ItemTitle>{t("resetHold")}</Menu.ItemTitle>
                  </Menu.Item>
                ) : null}
                {bufferedSelected > 0 && buffered === 0 ? (
                  <Menu.Item className="gap-3" onPress={confirmRelease}>
                    <RotateCcw size={18} color={muted} />
                    <Menu.ItemTitle>{t("autoHoldDisable")}</Menu.ItemTitle>
                  </Menu.Item>
                ) : null}
              </Menu.Content>
            </Menu.Portal>
          </Menu>
        </View>
      ) : null}

      {bufferedSelected > 0 ? (
        <PressableFeedback animation={false} onPress={confirmRelease}>
          <PressableFeedback.Scale>
            <Chip
              variant="secondary"
              size="lg"
              pointerEvents="none"
              className="w-full justify-start gap-2 px-4 py-3"
            >
              <PiggyBank size={18} color={muted} />
              <Chip.Label className="text-sm font-medium text-foreground">
                {t("holding")}
                {formatCents(bufferedSelected)}
                {t("nextMonth")}
              </Chip.Label>
            </Chip>
          </PressableFeedback.Scale>
          <PressableFeedback.Highlight className="rounded-3xl" />
        </PressableFeedback>
      ) : null}
    </View>
  );
}
