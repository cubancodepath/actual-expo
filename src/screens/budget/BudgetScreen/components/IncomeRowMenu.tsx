import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Menu, useThemeColor } from "heroui-native";
import { Hourglass, Receipt } from "lucide-react-native";
import { LiftMenu } from "@/ui/lift-menu";

interface IncomeRowMenuProps {
  /** Clone of the row, floated above the overlay while the menu is open. */
  preview: ReactNode;
  /** Whether this income category's received money currently auto-holds. */
  carryover: boolean;
  /** Toggle auto hold (income carryover) for the row's category. */
  onToggleAutoHold: () => void;
  /** Open the category's transactions for the current month. */
  onViewActivity: () => void;
}

/**
 * The income row's long-press lift menu. Same lift as {@link CategoryRowMenu}
 * but with the income-only actions: toggle auto hold, and view transactions.
 * Rendered from `BudgetScreen`'s `LiftMenu.Host`.
 */
export function IncomeRowMenu({
  preview,
  carryover,
  onToggleAutoHold,
  onViewActivity,
}: IncomeRowMenuProps) {
  const { t } = useTranslation("budget");
  const foreground = useThemeColor("foreground");

  return (
    <LiftMenu.Content preview={preview} estimatedMenuHeight={140}>
      <Menu.Item className="gap-3" onPress={onToggleAutoHold}>
        <Hourglass size={18} color={foreground} />
        <Menu.ItemTitle>{t(carryover ? "autoHoldDisable" : "autoHoldEnable")}</Menu.ItemTitle>
      </Menu.Item>
      <Menu.Item className="gap-3" onPress={onViewActivity}>
        <Receipt size={18} color={foreground} />
        <Menu.ItemTitle>{t("viewTransactions")}</Menu.ItemTitle>
      </Menu.Item>
    </LiftMenu.Content>
  );
}
