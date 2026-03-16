import { ActivityIndicator, type ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../providers/ThemeProvider";
import { ListItem } from "./ListItem";
import { IconButton } from "../atoms/IconButton";
import type { ReconciledBudgetFile, BudgetFileState } from "../../../services/budgetfiles";

export interface BudgetFileRowProps {
  file: ReconciledBudgetFile;
  isActive?: boolean;
  isSelecting?: boolean;
  isActionInProgress?: boolean;
  onPress?: () => void;
  onActionPress?: () => void;
  showSeparator?: boolean;
  style?: ViewStyle;
}

const STATE_ICON: Record<BudgetFileState, keyof typeof Ionicons.glyphMap> = {
  synced: "document-text",
  local: "document",
  detached: "alert-circle-outline",
  remote: "cloud-download-outline",
};

const STATE_LABEL_KEY = {
  synced: "fileState.synced",
  local: "fileState.local",
  detached: "fileState.detached",
  remote: "fileState.remote",
} as const satisfies Record<BudgetFileState, string>;

const ICON_SIZE = 22;

export function BudgetFileRow({
  file,
  isActive,
  isSelecting,
  isActionInProgress,
  onPress,
  onActionPress,
  showSeparator,
  style,
}: BudgetFileRowProps) {
  const { colors, spacing } = useTheme();
  const { t } = useTranslation();

  const subtitle = [
    t(STATE_LABEL_KEY[file.state]),
    file.ownerName,
    file.encryptKeyId ? t("fileState.encrypted") : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const iconName = STATE_ICON[file.state];
  const iconColor =
    file.state === "detached"
      ? colors.warning
      : file.state === "remote"
        ? colors.textMuted
        : colors.primary;
  const icon = <Ionicons name={iconName} size={ICON_SIZE} color={iconColor} />;

  let right: React.ReactNode = undefined;
  if (isSelecting || isActionInProgress) {
    right = <ActivityIndicator size="small" color={colors.primary} />;
  } else if (isActive && onActionPress) {
    right = (
      <>
        <Ionicons name="checkmark" size={20} color={colors.primary} />
        <IconButton
          ionIcon="ellipsis-horizontal"
          size={18}
          color={colors.textMuted}
          onPress={onActionPress}
          accessibilityLabel="Budget actions"
        />
      </>
    );
  } else if (isActive) {
    right = <Ionicons name="checkmark" size={20} color={colors.primary} />;
  } else if (onActionPress) {
    right = (
      <IconButton
        ionIcon="ellipsis-horizontal"
        size={18}
        color={colors.textMuted}
        onPress={onActionPress}
        accessibilityLabel="Budget actions"
      />
    );
  }

  return (
    <ListItem
      left={icon}
      title={file.name || "Unnamed budget"}
      subtitle={subtitle}
      right={right}
      onPress={isActive || isSelecting || isActionInProgress ? undefined : onPress}
      showSeparator={showSeparator}
      separatorInsetLeft={spacing.lg + ICON_SIZE + spacing.md}
      style={style}
    />
  );
}
