import type { ComponentProps } from "react";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { withUniwind } from "uniwind";
import { useTranslation } from "react-i18next";
import { Button, PressableFeedback, Spinner, Typography, useThemeColor } from "heroui-native";
import type { ReconciledBudgetFile, BudgetFileState } from "@/services/budgetfiles";

const StyledIonicons = withUniwind(Ionicons);

export interface BudgetFileRowProps {
  file: ReconciledBudgetFile;
  isActive?: boolean;
  isSelecting?: boolean;
  isActionInProgress?: boolean;
  onPress?: () => void;
  onActionPress?: () => void;
  showSeparator?: boolean;
}

type IoniconName = ComponentProps<typeof Ionicons>["name"];

const STATE_ICON: Record<BudgetFileState, IoniconName> = {
  synced: "document-text-outline",
  local: "document-outline",
  detached: "alert-circle-outline",
  remote: "cloud-download-outline",
};

const STATE_ICON_CLASS: Record<BudgetFileState, string> = {
  synced: "text-accent",
  local: "text-accent",
  detached: "text-warning",
  remote: "text-muted",
};

const STATE_LABEL_KEY = {
  synced: "fileState.synced",
  local: "fileState.local",
  detached: "fileState.detached",
  remote: "fileState.remote",
} as const satisfies Record<BudgetFileState, string>;

/** A budget file list row: state icon, name + state subtitle, and a busy/active/actions slot. */
export function BudgetFileRow({
  file,
  isActive,
  isSelecting,
  isActionInProgress,
  onPress,
  onActionPress,
  showSeparator,
}: BudgetFileRowProps) {
  const { t } = useTranslation();
  const { t: ta } = useTranslation("auth");
  const accent = useThemeColor("accent");

  const subtitle = [
    t(STATE_LABEL_KEY[file.state]),
    file.ownerName,
    file.encryptKeyId ? t("fileState.encrypted") : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const busy = isSelecting || isActionInProgress;

  return (
    <View>
      <PressableFeedback
        onPress={isActive || busy ? undefined : onPress}
        className="flex-row items-center gap-3 px-4 py-3"
      >
        <StyledIonicons
          name={STATE_ICON[file.state]}
          size={22}
          className={STATE_ICON_CLASS[file.state]}
        />
        <View className="flex-1">
          <Typography type="body" weight="medium" numberOfLines={1}>
            {file.name || ta("unnamedBudget")}
          </Typography>
          <Typography type="body-xs" color="muted" numberOfLines={1}>
            {subtitle}
          </Typography>
        </View>
        {busy ? (
          <Spinner size="sm" color={accent} />
        ) : (
          <View className="flex-row items-center gap-1">
            {isActive && <StyledIonicons name="checkmark" size={20} className="text-accent" />}
            {onActionPress && (
              <Button
                variant="ghost"
                size="sm"
                isIconOnly
                onPress={onActionPress}
                accessibilityLabel={ta("fileActions")}
              >
                <StyledIonicons name="ellipsis-horizontal" size={18} className="text-muted" />
              </Button>
            )}
          </View>
        )}
      </PressableFeedback>
      {showSeparator && <View className="h-px bg-separator ml-[52px]" />}
    </View>
  );
}
