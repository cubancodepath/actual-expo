import type { ReactNode } from "react";
import { useWindowDimensions } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { withUniwind } from "uniwind";
import { useTranslation } from "react-i18next";
import { Menu } from "heroui-native";
import type { RowRect } from "@/ui/BudgetFileRow";
import type { ReconciledBudgetFile } from "@/core/server/budgetfiles/app";
import { OPTIONS_BY_STATE, type FileAction, type FileActionOption } from "./fileActions";

const StyledIonicons = withUniwind(Ionicons);

interface BudgetFileRowMenuProps {
  /** Clone of the row, floated above the overlay while the menu is open. */
  preview: ReactNode;
  /** Where to float the preview and which way to open (window coordinates). */
  rect: RowRect;
  file: ReconciledBudgetFile;
  /** Fired once the floating clone has laid out — the live row hides itself then. */
  onPreviewLayout: () => void;
  onAction: (action: FileAction) => void;
}

/** Roughly how tall the menu renders; only used to choose which side to open on. */
const MENU_HEIGHT_ESTIMATE = 220;

const OVERLAY_IN = FadeIn.duration(120);
const OVERLAY_OUT = FadeOut.duration(100);
const PREVIEW_IN = FadeIn.duration(50);

/**
 * Popover content for a budget file's long-press menu, plus the iOS-style "lift":
 * a clone of the pressed row floated inside the portal (above a dim overlay) at
 * the row's measured frame, slightly scaled as if held. Mirrors the transaction /
 * budget-category row menus.
 */
export function BudgetFileRowMenu({
  preview,
  rect,
  file,
  onPreviewLayout,
  onAction,
}: BudgetFileRowMenuProps) {
  const { t } = useTranslation("auth");
  const { t: tc } = useTranslation("common");
  const { t: ts } = useTranslation("settings");
  const { height: windowHeight } = useWindowDimensions();

  const translate: Record<FileActionOption["namespace"], (key: string) => string> = {
    auth: t as (key: string) => string,
    settings: ts as (key: string) => string,
    common: tc as (key: string) => string,
  };

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
      <Menu.Content presentation="popover" width={260} placement={placement} align="start">
        {OPTIONS_BY_STATE[file.state].map((option) => (
          <Menu.Item key={option.action} className="gap-3" onPress={() => onAction(option.action)}>
            <StyledIonicons
              name={option.icon}
              size={18}
              className={option.isDestructive ? "text-danger" : "text-foreground"}
            />
            <Menu.ItemTitle className={option.isDestructive ? "text-danger" : undefined}>
              {translate[option.namespace](option.labelKey)}
            </Menu.ItemTitle>
          </Menu.Item>
        ))}
      </Menu.Content>
    </Menu.Portal>
  );
}
