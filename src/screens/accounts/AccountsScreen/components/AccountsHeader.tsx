import { View } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, Menu, useThemeColor } from "heroui-native";
import {
  Archive,
  ArrowLeftRight,
  EyeOff,
  MoreHorizontal,
  Plus,
  Settings,
  Undo2,
} from "lucide-react-native";
import { ScreenHeader } from "@/ui/ScreenHeader";

interface AccountsHeaderProps {
  showClosed: boolean;
  onToggleClosed: () => void;
  /** Number of closed accounts — the toggle only shows when there are any. */
  closedCount: number;
}

const noop = () => {};

/**
 * Accounts screen nav bar row, rendered inside `ScreenHeader.Floating` (frosted
 * blur ramps up on scroll). Centered title, an add-account button, and an
 * overflow menu. Menu items are visual placeholders for now (wired later),
 * except "Show/Hide Closed Accounts", which drives the list. The top inset
 * clears the notch/status bar since this is a tab root, not a modal card.
 */
export function AccountsHeader({ showClosed, onToggleClosed, closedCount }: AccountsHeaderProps) {
  const { t } = useTranslation("accounts");
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const foreground = useThemeColor("foreground");
  const muted = useThemeColor("muted");

  return (
    <View style={{ paddingTop: insets.top }}>
      <ScreenHeader>
        <ScreenHeader.Title>{t("title")}</ScreenHeader.Title>
        <ScreenHeader.Actions>
          <Button
            isIconOnly
            variant="tertiary"
            size="sm"
            onPress={() => router.push("/(auth)/account/new")}
            accessibilityLabel={t("addAccount")}
          >
            <Plus size={20} color={foreground} />
          </Button>

          <Menu>
            <Menu.Trigger asChild>
              <Button isIconOnly variant="tertiary" size="sm">
                <MoreHorizontal size={20} color={foreground} />
              </Button>
            </Menu.Trigger>
            <Menu.Portal>
              <Menu.Overlay />
              <Menu.Content presentation="popover" width={240} placement="bottom" align="end">
                <Menu.Item className="gap-3" onPress={noop}>
                  <Undo2 size={18} color={muted} />
                  <Menu.ItemTitle>{t("menu.undo")}</Menu.ItemTitle>
                </Menu.Item>
                <Menu.Item className="gap-3" onPress={noop}>
                  <EyeOff size={18} color={muted} />
                  <Menu.ItemTitle>{t("menu.hideAmounts")}</Menu.ItemTitle>
                </Menu.Item>
                <Menu.Item className="gap-3" onPress={noop}>
                  <ArrowLeftRight size={18} color={muted} />
                  <Menu.ItemTitle>{t("menu.switchBudget")}</Menu.ItemTitle>
                </Menu.Item>
                {closedCount > 0 ? (
                  <Menu.Item className="gap-3" onPress={onToggleClosed}>
                    {showClosed ? (
                      <EyeOff size={18} color={foreground} />
                    ) : (
                      <Archive size={18} color={foreground} />
                    )}
                    <Menu.ItemTitle>
                      {showClosed
                        ? t("menu.hideClosedAccounts")
                        : t("menu.showClosedAccounts", { count: closedCount })}
                    </Menu.ItemTitle>
                  </Menu.Item>
                ) : null}
                <Menu.Item className="gap-3" onPress={noop}>
                  <Settings size={18} color={muted} />
                  <Menu.ItemTitle>{t("menu.settings")}</Menu.ItemTitle>
                </Menu.Item>
              </Menu.Content>
            </Menu.Portal>
          </Menu>
        </ScreenHeader.Actions>
      </ScreenHeader>
    </View>
  );
}
