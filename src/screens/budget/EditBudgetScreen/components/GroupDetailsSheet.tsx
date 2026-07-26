import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { Button, useThemeColor } from "heroui-native";
import { EyeOff, Trash2 } from "lucide-react-native";
import { NameSheet } from "@/screens/budget/components/NameSheet";
import type { BudgetSection } from "@/screens/budget/hooks/useBudgetSections";

/**
 * Per-group details: rename, hide, delete.
 *
 * No `submitLabel` on purpose, so the name saves on blur and on dismiss — this
 * is the app's only auto-saving form; everywhere else saving is explicit.
 * Hiding and deleting are handed back up: the screen owns the confirmation
 * dialog, and nesting one overlay inside another is asking for trouble.
 */
export function GroupDetailsSheet({
  group,
  onRename,
  onHide,
  onDelete,
  onClose,
}: {
  group: BudgetSection | null;
  onRename: (group: BudgetSection, name: string) => Promise<void> | void;
  onHide: (group: BudgetSection) => void;
  onDelete: (group: BudgetSection) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation("budget");
  const [dangerForeground, accent] = useThemeColor(["danger-foreground", "accent"]);

  return (
    <NameSheet
      target={group}
      title={t("details")}
      label={t("groupNameLabel")}
      initialValue={group?.name ?? ""}
      onSave={async (name) => {
        if (group) await onRename(group, name);
      }}
      onClose={onClose}
    >
      <View className="flex-row gap-3">
        <Button variant="secondary" className="flex-1" onPress={() => group && onHide(group)}>
          <EyeOff size={18} color={accent} />
          <Button.Label>{t("hide")}</Button.Label>
        </Button>
        <Button variant="danger" className="flex-1" onPress={() => group && onDelete(group)}>
          <Trash2 size={18} color={dangerForeground} />
          <Button.Label>{t("delete")}</Button.Label>
        </Button>
      </View>
    </NameSheet>
  );
}
