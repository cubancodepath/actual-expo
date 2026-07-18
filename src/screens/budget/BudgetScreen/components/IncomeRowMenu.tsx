import type { ReactNode } from "react";
import { useWindowDimensions } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { useTranslation } from "react-i18next";
import { Menu, useThemeColor } from "heroui-native";
import { Hourglass, Receipt } from "lucide-react-native";
import type { RowRect } from "./CategoryRowMenu";

/** Roughly how tall the menu renders; only used to choose which side to open on. */
const MENU_HEIGHT_ESTIMATE = 140;

const OVERLAY_IN = FadeIn.duration(120);
const OVERLAY_OUT = FadeOut.duration(100);
const PREVIEW_IN = FadeIn.duration(50);

interface IncomeRowMenuProps {
  /** Clone of the row, floated above the overlay while the menu is open. */
  preview: ReactNode;
  /** The row's measured window frame — anchors the popover and the lift. */
  rect: RowRect;
  /** Fired once the floating clone has laid out — the live row hides itself then. */
  onPreviewLayout: () => void;
  /** Whether this income category's received money currently auto-holds. */
  carryover: boolean;
  /** Toggle auto hold (income carryover) for the row's category. */
  onToggleAutoHold: () => void;
  /** Open the category's transactions for the current month. */
  onViewActivity: () => void;
}

/**
 * The income row's long-press menu. Same iOS-style "lift" as
 * {@link CategoryRowMenu} — a scaled clone floats over a dimmed overlay at the
 * row's frame — but with the income-only actions: toggle auto hold, and view
 * transactions. Mounted inside the single `<Menu>` BudgetScreen opens for the
 * long-pressed row.
 */
export function IncomeRowMenu({
  preview,
  rect,
  onPreviewLayout,
  carryover,
  onToggleAutoHold,
  onViewActivity,
}: IncomeRowMenuProps) {
  const { t } = useTranslation("budget");
  const foreground = useThemeColor("foreground");
  const { height: windowHeight } = useWindowDimensions();

  const placement = rect.y + rect.height + MENU_HEIGHT_ESTIMATE > windowHeight ? "top" : "bottom";

  return (
    <Menu.Portal>
      <Menu.Overlay
        className="bg-black/20"
        animation={{ entering: OVERLAY_IN, exiting: OVERLAY_OUT }}
      />
      <Animated.View
        entering={PREVIEW_IN}
        pointerEvents="none"
        onLayout={onPreviewLayout}
        className="absolute overflow-hidden rounded-xl bg-overlay shadow-overlay"
        style={{ left: rect.x, top: rect.y, width: rect.width, transform: [{ scale: 0.97 }] }}
      >
        {preview}
      </Animated.View>
      <Menu.Content presentation="popover" width={240} placement={placement} align="start">
        <Menu.Item className="gap-3" onPress={onToggleAutoHold}>
          <Hourglass size={18} color={foreground} />
          <Menu.ItemTitle>{t(carryover ? "autoHoldDisable" : "autoHoldEnable")}</Menu.ItemTitle>
        </Menu.Item>
        <Menu.Item className="gap-3" onPress={onViewActivity}>
          <Receipt size={18} color={foreground} />
          <Menu.ItemTitle>{t("viewTransactions")}</Menu.ItemTitle>
        </Menu.Item>
      </Menu.Content>
    </Menu.Portal>
  );
}
