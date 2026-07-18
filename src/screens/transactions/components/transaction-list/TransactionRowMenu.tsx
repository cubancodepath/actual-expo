import type { ReactNode } from "react";
import { useWindowDimensions } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { useTranslation } from "react-i18next";
import { Menu, useThemeColor } from "heroui-native";
import { ArrowLeftRight, Copy, Copyright, Inbox, Trash2 } from "lucide-react-native";

/** Window frame of the row the menu is anchored to. */
export interface RowRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface TransactionRowMenuProps {
  /** Clone of the row's content, floated above the overlay while the menu is open. */
  preview: ReactNode;
  /** Where to float the preview and which way to open (window coordinates). */
  rect: RowRect;
  /** Fired once the floating clone has laid out — the live row hides itself then. */
  onPreviewLayout: () => void;
  /** Picks the Clear/Unclear label. */
  cleared: boolean;
  /** One of the menu's actions was chosen — the host closes the menu and runs it. */
  onAction: (action: TransactionMenuAction) => void;
}

export type TransactionMenuAction =
  | "categorize"
  | "move"
  | "toggleCleared"
  | "duplicate"
  | "delete";

/** Roughly how tall the menu renders; only used to choose which side to open on. */
const MENU_HEIGHT_ESTIMATE = 260;

// Entering/exiting builders are class instances, not plain values — build them
// once so opening the menu doesn't allocate three per render.
const OVERLAY_IN = FadeIn.duration(120);
const OVERLAY_OUT = FadeOut.duration(100);
const PREVIEW_IN = FadeIn.duration(50);

/**
 * Popover content for a transaction's long-press menu, plus the iOS-style
 * "lift": a clone of the pressed row rendered inside the portal — above the dim
 * overlay — at the row's measured frame, slightly scaled down as if held.
 * Mounted inside the single `<Menu>` that `TransactionsListScreen` opens for
 * whichever row was long-pressed.
 */
export function TransactionRowMenu({
  preview,
  rect,
  onPreviewLayout,
  cleared,
  onAction,
}: TransactionRowMenuProps) {
  const { t } = useTranslation("transactions");
  const foreground = useThemeColor("foreground");
  const danger = useThemeColor("danger");
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
        <Menu.Item className="gap-3" onPress={() => onAction("categorize")}>
          <Inbox size={18} color={foreground} />
          <Menu.ItemTitle>{t("contextCategorize")}</Menu.ItemTitle>
        </Menu.Item>
        <Menu.Item className="gap-3" onPress={() => onAction("move")}>
          <ArrowLeftRight size={18} color={foreground} />
          <Menu.ItemTitle>{t("contextMoveToAccount")}</Menu.ItemTitle>
        </Menu.Item>
        <Menu.Item className="gap-3" onPress={() => onAction("toggleCleared")}>
          <Copyright size={18} color={foreground} />
          <Menu.ItemTitle>{t(cleared ? "contextUnclear" : "contextClear")}</Menu.ItemTitle>
        </Menu.Item>
        <Menu.Item className="gap-3" onPress={() => onAction("duplicate")}>
          <Copy size={18} color={foreground} />
          <Menu.ItemTitle>{t("contextDuplicate")}</Menu.ItemTitle>
        </Menu.Item>
        <Menu.Item className="gap-3" onPress={() => onAction("delete")}>
          <Trash2 size={18} color={danger} />
          <Menu.ItemTitle className="text-danger">{t("contextDelete")}</Menu.ItemTitle>
        </Menu.Item>
      </Menu.Content>
    </Menu.Portal>
  );
}
