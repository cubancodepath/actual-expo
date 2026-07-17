import type { ReactNode } from "react";
import { useWindowDimensions } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
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

/** Window frame of the row the menu is anchored to. */
export interface RowRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface CategoryRowMenuProps {
  /** Clone of the row's content, floated above the overlay while the menu is open. */
  preview: ReactNode;
  /** Where to float the preview and which way to open (window coordinates). */
  rect: RowRect;
  /** Fired once the floating clone has laid out — the live row hides itself then. */
  onPreviewLayout: () => void;
  /** Open the new-transaction form seeded with the row's category. */
  onAddTransaction: () => void;
  /** Open the move-money screen for the row the menu belongs to. */
  onMoveMoney: () => void;
  /** Open the goals editor for the row's category. Hidden when unset. */
  onEditGoals?: () => void;
  /** Whether this category's balance currently rolls over — picks the label. */
  carryover: boolean;
  /** Toggle overspending rollover for the row's category. */
  onToggleCarryover: () => void;
  /** Open the category details modal for the row's category. */
  onViewDetails: () => void;
}

/** Roughly how tall the menu renders; only used to choose which side to open on. */
const MENU_HEIGHT_ESTIMATE = 350;

// Entering/exiting builders are class instances, not plain values — build them
// once so opening the menu doesn't allocate three per render.
const OVERLAY_IN = FadeIn.duration(120);
const OVERLAY_OUT = FadeOut.duration(100);
const PREVIEW_IN = FadeIn.duration(50);

/**
 * Popover content for a budget category's long-press menu, plus the iOS-style
 * "lift": a clone of the pressed row rendered inside the portal — above the dim
 * overlay — at the row's measured frame, slightly scaled down as if held. The
 * actions still on `noop` are the ones not implemented yet. Mounted inside the
 * single `<Menu>` that `BudgetScreen` opens for whichever row was long-pressed.
 */
export function CategoryRowMenu({
  preview,
  rect,
  onPreviewLayout,
  onAddTransaction,
  onMoveMoney,
  onEditGoals,
  carryover,
  onToggleCarryover,
  onViewDetails,
}: CategoryRowMenuProps) {
  const { t } = useTranslation("budget");
  const foreground = useThemeColor("foreground");
  const { height: windowHeight } = useWindowDimensions();

  // Open above the row when there isn't room for the menu below it — otherwise
  // collision avoidance would slide the popover up and cover the row.
  const placement = rect.y + rect.height + MENU_HEIGHT_ESTIMATE > windowHeight ? "top" : "bottom";

  return (
    <Menu.Portal>
      {/* Dim the whole screen; the preview clone below sits above this layer.
          Tightened fades so the lift and the popover read as one gesture. */}
      <Menu.Overlay
        className="bg-black/20"
        animation={{ entering: OVERLAY_IN, exiting: OVERLAY_OUT }}
      />
      <Animated.View
        entering={PREVIEW_IN}
        pointerEvents="none"
        onLayout={onPreviewLayout}
        className="absolute overflow-hidden rounded-xl bg-overlay shadow-overlay"
        style={{
          left: rect.x,
          top: rect.y,
          width: rect.width,
          transform: [{ scale: 0.97 }],
        }}
      >
        {preview}
      </Animated.View>
      <Menu.Content presentation="popover" width={240} placement={placement} align="start">
        <Menu.Item className="gap-3" onPress={onAddTransaction}>
          <CirclePlus size={18} color={foreground} />
          <Menu.ItemTitle>{t("categoryMenu.addTransaction")}</Menu.ItemTitle>
        </Menu.Item>
        <Menu.Item className="gap-3" onPress={noop}>
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
      </Menu.Content>
    </Menu.Portal>
  );
}
