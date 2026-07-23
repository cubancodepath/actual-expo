import type { ReactNode } from "react";
import { Ionicons } from "@expo/vector-icons";
import { withUniwind } from "uniwind";
import { useTranslation } from "react-i18next";
import { Menu } from "heroui-native";
import type { ReconciledBudgetFile } from "@/core/server/budgetfiles/app";
import { LiftMenu } from "@/ui/lift-menu";
import { OPTIONS_BY_STATE, type FileAction, type FileActionOption } from "./fileActions";

const StyledIonicons = withUniwind(Ionicons);

interface BudgetFileRowMenuProps {
  /** Clone of the row, floated above the overlay while the menu is open. */
  preview: ReactNode;
  file: ReconciledBudgetFile;
  onAction: (action: FileAction) => void;
}

/**
 * Popover items for a budget file's long-press lift menu — the options depend
 * on the file's sync state. Rendered from `BudgetFileRowMenuHost`'s
 * `LiftMenu.Host`.
 */
export function BudgetFileRowMenu({ preview, file, onAction }: BudgetFileRowMenuProps) {
  const { t } = useTranslation("auth");
  const { t: tc } = useTranslation("common");
  const { t: ts } = useTranslation("settings");

  const translate: Record<FileActionOption["namespace"], (key: string) => string> = {
    auth: t as (key: string) => string,
    settings: ts as (key: string) => string,
    common: tc as (key: string) => string,
  };

  return (
    <LiftMenu.Content preview={preview} width={260} estimatedMenuHeight={220}>
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
    </LiftMenu.Content>
  );
}
