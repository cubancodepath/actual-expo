import { View } from "react-native";
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
  cn,
  ListGroup,
  PressableFeedback,
  Separator,
  Spinner,
  useThemeColor,
  type ThemeColor,
} from "heroui-native";
import { ROW_PRESS_ANIMATION, useLiftLongPress, type RowRect } from "@/ui/lift-menu";
import type { ReconciledBudgetFile, BudgetFileState } from "@/core/server/budgetfiles/app";

export interface BudgetFileRowProps {
  file: ReconciledBudgetFile;
  isActive?: boolean;
  isSelecting?: boolean;
  isActionInProgress?: boolean;
  onPress?: () => void;
  /** Long-press → the lift context menu. `rect` is the row's window frame. */
  onLongPress?: (rect: RowRect) => void;
  /** Menu is open on this row and its floating clone is up → hide the live row. */
  isLifted?: boolean;
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
  isLifted = false,
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

  // Too bespoke for LiftMenu.Row (ripple feedback, lock gating, separator
  // outside the measured view) — shares just the long-press half.
  const { rowRef, handleLongPress } = useLiftLongPress(locked ? undefined : onLongPress);

  return (
    <PressableFeedback
      animation={false}
      onPress={isActive || locked ? undefined : onPress}
      onLongPress={handleLongPress}
    >
      {/* ListGroup.Item is itself a Pressable — it must be `disabled` so it doesn't
          swallow the touch; the outer PressableFeedback owns onPress/onLongPress. */}
      <PressableFeedback.Scale animation={ROW_PRESS_ANIMATION.scale}>
        <View ref={rowRef} className={cn(isLifted && "opacity-0")}>
          <ListGroup.Item className="flex-row items-center px-4 py-2 gap-4" disabled>
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
        </View>
        {showSeparator && <Separator className="ml-13" />}
      </PressableFeedback.Scale>
      <PressableFeedback.Ripple />
    </PressableFeedback>
  );
}
