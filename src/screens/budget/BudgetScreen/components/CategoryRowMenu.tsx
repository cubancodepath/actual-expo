import type { ReactNode } from "react";
import { useWindowDimensions } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { useTranslation } from "react-i18next";
import { Menu, useThemeColor } from "heroui-native";
import { ArrowLeftRight, ChartLine, Info, Plus, Target } from "lucide-react-native";

/** Window-relative frame of the pressed row, measured on long-press. */
export interface PreviewRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface CategoryRowMenuProps {
  /** Clone of the row's content, floated above the overlay while the menu is open. */
  preview: ReactNode;
  /** Where to float the preview (window coordinates); null until first long-press. */
  previewRect: PreviewRect | null;
  /** Fired once the floating clone has laid out — the live row hides itself then. */
  onPreviewLayout: () => void;
}

/** No-op placeholder for the menu actions that aren't wired yet. */
const noop = () => {};

/**
 * Popover content for a budget category's long-press menu, plus the iOS-style
 * "lift": a clone of the pressed row rendered inside the portal — above the dim
 * overlay — at the row's measured position, slightly scaled down as if held.
 * The five actions render label + icon and call `noop` until they're wired up.
 * Mounted inside a controlled `<Menu>` in `BudgetCategoryRow`.
 */
export function CategoryRowMenu({ preview, previewRect, onPreviewLayout }: CategoryRowMenuProps) {
  const { t } = useTranslation("budget");
  const foreground = useThemeColor("foreground");
  const { height: windowHeight } = useWindowDimensions();

  // Open above the row when there isn't room for the menu below it — otherwise
  // collision avoidance would slide the popover up and cover the row.
  const MENU_HEIGHT_ESTIMATE = 300;
  const placement =
    previewRect && previewRect.y + previewRect.height + MENU_HEIGHT_ESTIMATE > windowHeight
      ? "top"
      : "bottom";

  return (
    <Menu.Portal>
      {/* Dim the whole screen; the preview clone below sits above this layer.
          Tightened fades so the lift and the popover read as one gesture. */}
      <Menu.Overlay
        className="bg-black/20"
        animation={{
          entering: FadeIn.duration(120),
          exiting: FadeOut.duration(100),
        }}
      />
      {previewRect && (
        <Animated.View
          entering={FadeIn.duration(50)}
          pointerEvents="none"
          onLayout={onPreviewLayout}
          className="absolute overflow-hidden rounded-xl bg-overlay shadow-overlay"
          style={{
            left: previewRect.x,
            top: previewRect.y,
            width: previewRect.width,
            transform: [{ scale: 0.97 }],
          }}
        >
          {preview}
        </Animated.View>
      )}
      <Menu.Content presentation="popover" width={240} placement={placement} align="start">
        <Menu.Item className="gap-3" onPress={noop}>
          <Plus size={18} color={foreground} />
          <Menu.ItemTitle>{t("categoryMenu.addTransaction")}</Menu.ItemTitle>
        </Menu.Item>
        <Menu.Item className="gap-3" onPress={noop}>
          <ChartLine size={18} color={foreground} />
          <Menu.ItemTitle>{t("categoryMenu.viewActivity")}</Menu.ItemTitle>
        </Menu.Item>
        <Menu.Item className="gap-3" onPress={noop}>
          <ArrowLeftRight size={18} color={foreground} />
          <Menu.ItemTitle>{t("categoryMenu.viewMoves")}</Menu.ItemTitle>
        </Menu.Item>
        <Menu.Item className="gap-3" onPress={noop}>
          <Target size={18} color={foreground} />
          <Menu.ItemTitle>{t("categoryMenu.editTargets")}</Menu.ItemTitle>
        </Menu.Item>
        <Menu.Item className="gap-3" onPress={noop}>
          <Info size={18} color={foreground} />
          <Menu.ItemTitle>{t("categoryMenu.viewDetails")}</Menu.ItemTitle>
        </Menu.Item>
      </Menu.Content>
    </Menu.Portal>
  );
}
