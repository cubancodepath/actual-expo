import { View } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, Menu, useThemeColor } from "heroui-native";
import { Eye, EyeOff, MoreHorizontal, Plus, Settings, Undo2 } from "lucide-react-native";
import { ScreenHeader } from "@/ui/ScreenHeader";
import { usePrivacyMode } from "@/lib/hooks/usePrivacyMode";

const noop = () => {};

/**
 * Accounts screen nav bar row, rendered inside `ScreenHeader.Floating` (frosted
 * blur ramps up on scroll). Centered title, an add-account button, and an
 * overflow menu (visual placeholders for now, wired later). The top inset
 * clears the notch/status bar since this is a tab root, not a modal card.
 */
export function AccountsHeader() {
  const { t } = useTranslation("accounts");
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const foreground = useThemeColor("foreground");
  const muted = useThemeColor("muted");
  const [privacyMode, togglePrivacy] = usePrivacyMode();

  return (
    <View style={{ paddingTop: insets.top }} className="pb-4">
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
                <Menu.Item className="gap-3" onPress={togglePrivacy}>
                  {privacyMode ? (
                    <Eye size={18} color={muted} />
                  ) : (
                    <EyeOff size={18} color={muted} />
                  )}
                  <Menu.ItemTitle>
                    {privacyMode ? t("menu.showAmounts") : t("menu.hideAmounts")}
                  </Menu.ItemTitle>
                </Menu.Item>
                <Menu.Item className="gap-3" onPress={() => router.push("/(auth)/settings")}>
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
