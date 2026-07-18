import type { ReactNode } from "react";
import { useWindowDimensions } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { useTranslation } from "react-i18next";
import { Menu, useThemeColor } from "heroui-native";
import { Check, Eye, SkipForward, Trash2 } from "lucide-react-native";
import type { RowRect } from "./TransactionRowMenu";

export type PreviewMenuAction = "post" | "skip" | "view" | "delete";

interface PreviewRowMenuProps {
  /** Clone of the preview row, floated above the overlay while the menu is open. */
  preview: ReactNode;
  /** Where to float the preview and which way to open (window coordinates). */
  rect: RowRect;
  /** Fired once the floating clone has laid out — the live row hides itself then. */
  onPreviewLayout: () => void;
  /** One of the menu's actions was chosen — the host closes the menu and runs it. */
  onAction: (action: PreviewMenuAction) => void;
}

const MENU_HEIGHT_ESTIMATE = 230;

const OVERLAY_IN = FadeIn.duration(120);
const OVERLAY_OUT = FadeOut.duration(100);
const PREVIEW_IN = FadeIn.duration(50);

/**
 * Long-press menu + iOS-style "lift" for a schedule preview row. Mirrors
 * TransactionRowMenu but offers schedule actions (post / skip / edit / delete).
 */
export function PreviewRowMenu({ preview, rect, onPreviewLayout, onAction }: PreviewRowMenuProps) {
  const { t } = useTranslation("schedules");
  const foreground = useThemeColor("foreground");
  const danger = useThemeColor("danger");
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
        <Menu.Item className="gap-3" onPress={() => onAction("post")}>
          <Check size={18} color={foreground} />
          <Menu.ItemTitle>{t("postTransactionNow")}</Menu.ItemTitle>
        </Menu.Item>
        <Menu.Item className="gap-3" onPress={() => onAction("skip")}>
          <SkipForward size={18} color={foreground} />
          <Menu.ItemTitle>{t("skipNextDate")}</Menu.ItemTitle>
        </Menu.Item>
        <Menu.Item className="gap-3" onPress={() => onAction("view")}>
          <Eye size={18} color={foreground} />
          <Menu.ItemTitle>{t("viewSchedule")}</Menu.ItemTitle>
        </Menu.Item>
        <Menu.Item className="gap-3" onPress={() => onAction("delete")}>
          <Trash2 size={18} color={danger} />
          <Menu.ItemTitle className="text-danger">{t("deleteSchedule")}</Menu.ItemTitle>
        </Menu.Item>
      </Menu.Content>
    </Menu.Portal>
  );
}
