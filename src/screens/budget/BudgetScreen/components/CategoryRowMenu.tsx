import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Menu, useThemeColor } from "heroui-native";
import {
  ArrowLeftRight,
  ArrowRight,
  ChartLine,
  CirclePlus,
  ClockArrowLeft,
  Ellipsis,
  Target,
} from "lucide-react-native";
import { noop } from "@/screens/budget/constants";
import { LiftMenu } from "@/ui/lift-menu";

interface CategoryRowMenuProps {
  /** Clone of the row's content, floated above the overlay while the menu is open. */
  preview: ReactNode;
  /** Open the new-transaction form seeded with the row's category. */
  onAddTransaction: () => void;
  /** Open the move-money screen for the row the menu belongs to. */
  onMoveMoney: () => void;
  /** Open the category's transactions for the current month. */
  onViewActivity: () => void;
  /** Open the goals editor for the row's category. Hidden when unset. */
  onEditGoals?: () => void;
  /** Whether this category's balance currently rolls over — picks the label. */
  carryover: boolean;
  /** Toggle overspending rollover for the row's category. */
  onToggleCarryover: () => void;
  /** Open the category details modal for the row's category. */
  onViewDetails: () => void;
}

/**
 * Popover items for a budget category's long-press lift menu. The actions still
 * on `noop` are the ones not implemented yet. Rendered from `BudgetScreen`'s
 * `LiftMenu.Host` for whichever row was long-pressed.
 */
export function CategoryRowMenu({
  preview,
  onAddTransaction,
  onMoveMoney,
  onViewActivity,
  onEditGoals,
  carryover,
  onToggleCarryover,
  onViewDetails,
}: CategoryRowMenuProps) {
  const { t } = useTranslation("budget");
  const foreground = useThemeColor("foreground");

  return (
    <LiftMenu.Content preview={preview} estimatedMenuHeight={350}>
      <Menu.Item className="gap-3" onPress={onAddTransaction}>
        <CirclePlus size={18} color={foreground} />
        <Menu.ItemTitle>{t("categoryMenu.addTransaction")}</Menu.ItemTitle>
      </Menu.Item>
      <Menu.Item className="gap-3" onPress={onViewActivity}>
        <ChartLine size={18} color={foreground} />
        <Menu.ItemTitle>{t("categoryMenu.viewActivity")}</Menu.ItemTitle>
      </Menu.Item>
      <Menu.Item className="gap-3" onPress={noop}>
        <ClockArrowLeft size={18} color={foreground} />
        <Menu.ItemTitle>{t("categoryMenu.viewMoves")}</Menu.ItemTitle>
      </Menu.Item>
      <Menu.Item className="gap-3" onPress={onMoveMoney}>
        <ArrowLeftRight size={18} color={foreground} />
        <Menu.ItemTitle>{t("categoryMenu.moveMoney")}</Menu.ItemTitle>
      </Menu.Item>
      <Menu.Item className="gap-3" onPress={onToggleCarryover}>
        <ArrowRight size={18} color={foreground} />
        <Menu.ItemTitle>
          {t(carryover ? "categoryMenu.rolloverDisable" : "categoryMenu.rolloverEnable")}
        </Menu.ItemTitle>
      </Menu.Item>
      {onEditGoals ? (
        <Menu.Item className="gap-3" onPress={onEditGoals}>
          <Target size={18} color={foreground} />
          <Menu.ItemTitle>{t("categoryMenu.editGoals")}</Menu.ItemTitle>
        </Menu.Item>
      ) : null}
      <Menu.Item className="gap-3" onPress={onViewDetails}>
        <Ellipsis size={18} color={foreground} />
        <Menu.ItemTitle>{t("categoryMenu.viewDetails")}</Menu.ItemTitle>
      </Menu.Item>
    </LiftMenu.Content>
  );
}
