import { useTranslation } from "react-i18next";
import {
  Check,
  CloudCheck,
  CloudDownload,
  CloudOff,
  Smartphone,
  type LucideIcon,
} from "lucide-react-native";
import {
  ListGroup,
  PressableFeedback,
  Separator,
  Spinner,
  useThemeColor,
  type ThemeColor,
} from "heroui-native";
import type { ReconciledBudgetFile, BudgetFileState } from "@/core/server/budgetfiles/app";

export interface BudgetFileRowProps {
  file: ReconciledBudgetFile;
  isActive?: boolean;
  isSelecting?: boolean;
  isActionInProgress?: boolean;
  onPress?: () => void;
  /** Long-press: contextual actions (the actions sheet). */
  onLongPress?: () => void;
  showSeparator?: boolean;
}

const STATE_ICON: Record<BudgetFileState, LucideIcon> = {
  synced: CloudCheck,
  local: Smartphone,
  detached: CloudOff,
  remote: CloudDownload,
};

const STATE_ICON_COLOR: Record<BudgetFileState, ThemeColor> = {
  synced: "accent",
  local: "muted",
  detached: "warning",
  remote: "muted",
};

const STATE_LABEL_KEY = {
  synced: "fileState.synced",
  local: "fileState.local",
  detached: "fileState.detached",
  remote: "fileState.remote",
} as const satisfies Record<BudgetFileState, string>;

/** A budget file list row: state icon, name + state subtitle, and a busy/active suffix. */
export function BudgetFileRow({
  file,
  isActive,
  isSelecting,
  isActionInProgress,
  onPress,
  onLongPress,
  showSeparator,
}: BudgetFileRowProps) {
  const { t } = useTranslation();
  const { t: ta } = useTranslation("auth");
  const [accent, stateColor] = useThemeColor(["accent", STATE_ICON_COLOR[file.state]]);

  const StateIcon = STATE_ICON[file.state];

  const subtitle = [
    t(STATE_LABEL_KEY[file.state]),
    file.ownerName,
    file.encryptKeyId ? t("fileState.encrypted") : null,
  ]
    .filter(Boolean)
    .join(" · ");

  // Locks interaction while selecting/acting; selecting itself no longer paints a
  // spinner (the full-screen open-budget loader covers the row).
  const locked = isSelecting || isActionInProgress;

  return (
    <PressableFeedback
      animation={false}
      onLongPress={locked ? undefined : onLongPress}
      onPress={isActive || locked ? undefined : onPress}
    >
      <PressableFeedback.Scale>
        <ListGroup.Item
          className="flex-row items-center px-4 py-2 gap-4"
          disabled={isActive || locked}
        >
          <ListGroup.ItemPrefix>
            <StateIcon size={22} color={stateColor} />
          </ListGroup.ItemPrefix>
          <ListGroup.ItemContent>
            <ListGroup.ItemTitle numberOfLines={1}>
              {file.name || ta("unnamedBudget")}
            </ListGroup.ItemTitle>
            <ListGroup.ItemDescription numberOfLines={1}>{subtitle}</ListGroup.ItemDescription>
          </ListGroup.ItemContent>
          {(isActionInProgress || isActive) && (
            <ListGroup.ItemSuffix>
              {isActionInProgress ? (
                <Spinner size="sm" color={accent} />
              ) : (
                <Check size={20} color={accent} />
              )}
            </ListGroup.ItemSuffix>
          )}
        </ListGroup.Item>
        {showSeparator && <Separator className="ml-13" />}
      </PressableFeedback.Scale>
      <PressableFeedback.Ripple />
    </PressableFeedback>
  );
}
