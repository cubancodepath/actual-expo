import { useWindowDimensions } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { useTranslation } from "react-i18next";
import { Menu, useThemeColor } from "heroui-native";
import { ArchiveRestore, List, Pencil, Trash2 } from "lucide-react-native";
import type { Account } from "@/core/types/models";
import { AccountRowContent } from "./AccountRow";
import type { RowRect } from "./AccountRow";

export type AccountMenuAction = "view" | "edit" | "close" | "reopen";

interface AccountRowMenuProps {
  account: Account;
  /** Where to float the preview and which way to open (window coordinates). */
  rect: RowRect;
  /** Fired once the floating clone has laid out — the live row hides itself then. */
  onPreviewLayout: () => void;
  /** One of the menu's actions was chosen — the host closes the menu and runs it. */
  onAction: (action: AccountMenuAction) => void;
}

/** Roughly how tall the menu renders; only used to choose which side to open on. */
const MENU_HEIGHT_ESTIMATE = 200;

const OVERLAY_IN = FadeIn.duration(120);
const OVERLAY_OUT = FadeOut.duration(100);
const PREVIEW_IN = FadeIn.duration(50);

/**
 * Popover content for an account's long-press menu, plus the iOS-style "lift": a
 * clone of the pressed row floated over the dim overlay at its measured frame.
 * Mounted inside the single `<Menu>` the accounts screen opens for whichever row
 * was long-pressed. Options are the list-level conveniences (the fuller account
 * options live on the account's transactions page).
 */
export function AccountRowMenu({ account, rect, onPreviewLayout, onAction }: AccountRowMenuProps) {
  const { t } = useTranslation("accounts");
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
        <AccountRowContent account={account} />
      </Animated.View>
      <Menu.Content presentation="popover" width={240} placement={placement} align="start">
        <Menu.Item className="gap-3" onPress={() => onAction("view")}>
          <List size={18} color={foreground} />
          <Menu.ItemTitle>{t("contextMenu.viewTransactions")}</Menu.ItemTitle>
        </Menu.Item>
        <Menu.Item className="gap-3" onPress={() => onAction("edit")}>
          <Pencil size={18} color={foreground} />
          <Menu.ItemTitle>{t("contextMenu.editAccount")}</Menu.ItemTitle>
        </Menu.Item>
        {account.closed ? (
          <Menu.Item className="gap-3" onPress={() => onAction("reopen")}>
            <ArchiveRestore size={18} color={foreground} />
            <Menu.ItemTitle>{t("contextMenu.reopenAccount")}</Menu.ItemTitle>
          </Menu.Item>
        ) : (
          <Menu.Item className="gap-3" onPress={() => onAction("close")}>
            <Trash2 size={18} color={danger} />
            <Menu.ItemTitle className="text-danger">{t("contextMenu.closeAccount")}</Menu.ItemTitle>
          </Menu.Item>
        )}
      </Menu.Content>
    </Menu.Portal>
  );
}
