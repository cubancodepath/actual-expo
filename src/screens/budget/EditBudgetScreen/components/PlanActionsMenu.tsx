import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { Button, Menu, useThemeColor } from "heroui-native";
import { ArrowUpDown, FolderPlus, MoreHorizontal } from "lucide-react-native";

/**
 * The plan editor's overflow menu, for actions that belong to the whole plan
 * rather than to one group. Lives in `EnvelopeSheet.Actions` — the top-right
 * corner, opposite the back button.
 */
export function PlanActionsMenu({ onNewGroup }: { onNewGroup: () => void }) {
  const { t } = useTranslation("budget");
  const { t: tc } = useTranslation("common");
  const router = useRouter();
  const foreground = useThemeColor("foreground");

  return (
    <Menu>
      <Menu.Trigger asChild>
        <Button
          isIconOnly
          variant="secondary"
          className="rounded-full"
          accessibilityLabel={tc("a11y.moreOptions")}
        >
          <MoreHorizontal size={22} color={foreground} />
        </Button>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Overlay />
        <Menu.Content presentation="popover" width={240} placement="bottom" align="end">
          <Menu.Item className="gap-3" onPress={onNewGroup}>
            <FolderPlus size={18} color={foreground} />
            <Menu.ItemTitle>{t("newCategoryGroup")}</Menu.ItemTitle>
          </Menu.Item>
          <Menu.Item
            className="gap-3"
            onPress={() => router.push("/(auth)/budget/reorder-categories")}
          >
            <ArrowUpDown size={18} color={foreground} />
            <Menu.ItemTitle>{t("reorderCategories")}</Menu.ItemTitle>
          </Menu.Item>
        </Menu.Content>
      </Menu.Portal>
    </Menu>
  );
}
