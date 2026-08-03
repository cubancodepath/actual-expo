import { memo } from "react";
import type { AccessibilityActionEvent } from "react-native";
import { useTranslation } from "react-i18next";
import { cn, ListGroup, PressableFeedback, Separator, useThemeColor } from "heroui-native";
import { GripVertical } from "lucide-react-native";
import { useIsActive, useReorderableDrag } from "react-native-reorderable-list";
import { mediumHaptic } from "@/ui/haptics";
import type { ReorderCategoryRowData } from "../lib/reorderModel";

/**
 * A category in the reorder list.
 *
 * The list underneath is flat (see `reorderModel`), so the card that groups these
 * rows visually is faked one row at a time: every row paints the same
 * `bg-surface` as a real `ListGroup`, and only the group's first and last rows
 * round their outer corners. A run of them is indistinguishable from the single
 * rounded card the plan editor draws, and unlike a real card it can be split and
 * rejoined as rows move between groups.
 *
 * Picked up, it stops being a slice of that card and rounds all four corners:
 * what's under the finger is a single row in flight, and square edges would keep
 * claiming it's still joined to the rows it left behind.
 *
 * Dragging starts from the handle after a short press, and from anywhere on the
 * row after a normal long press — the handle says where to grab, it isn't the
 * only place you can.
 */
export const ReorderCategoryRow = memo(function ReorderCategoryRow({
  row,
  index,
  isFirst,
  isLast,
  canMoveUp,
  canMoveDown,
  onMove,
}: {
  row: ReorderCategoryRowData;
  /** Its position in the flat list, which is what a move is expressed in. */
  index: number;
  isFirst: boolean;
  isLast: boolean;
  /** Whether the row has anywhere to go — gates the accessibility actions. */
  canMoveUp: boolean;
  canMoveDown: boolean;
  /** Stable across renders, so this row's memo is worth something. */
  onMove: (from: number, to: number) => void;
}) {
  const { t } = useTranslation("budget");
  const drag = useReorderableDrag();
  const isDragging = useIsActive();
  const muted = useThemeColor("muted");

  const startDrag = () => {
    mediumHaptic();
    drag();
  };

  // Dragging is unreachable with a screen reader on, so the same two moves are
  // offered as rotor actions. They step one position at a time, which is enough
  // to cross a group boundary too: the row above the next group's header is one
  // step from being inside it.
  const actions = [
    ...(canMoveUp ? [{ name: "moveUp", label: t("reorderScreen.moveUp") }] : []),
    ...(canMoveDown ? [{ name: "moveDown", label: t("reorderScreen.moveDown") }] : []),
  ];

  const onAccessibilityAction = (event: AccessibilityActionEvent) => {
    if (event.nativeEvent.actionName === "moveUp") onMove(index, index - 1);
    if (event.nativeEvent.actionName === "moveDown") onMove(index, index + 1);
  };

  return (
    <ListGroup
      className={cn(
        "rounded-none",
        isFirst && "rounded-t-2xl",
        isLast && "rounded-b-2xl",
        isDragging && "rounded-2xl",
      )}
    >
      {/* Divider between rows of the same card, never across its edges — and
          never on a row that has been lifted out of the card entirely. */}
      {!isFirst && !isDragging ? <Separator className="mx-4" /> : null}
      <ListGroup.Item
        onLongPress={startDrag}
        accessibilityLabel={row.name}
        accessibilityHint={t("reorderScreen.rowHint")}
        accessibilityActions={actions}
        onAccessibilityAction={onAccessibilityAction}
      >
        <ListGroup.ItemContent>
          <ListGroup.ItemTitle numberOfLines={1}>{row.name}</ListGroup.ItemTitle>
        </ListGroup.ItemContent>
        <ListGroup.ItemSuffix>
          <PressableFeedback
            onLongPress={startDrag}
            delayLongPress={120}
            hitSlop={12}
            // The row already carries the label and the move actions; a second
            // focus stop on the handle would only repeat them.
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <GripVertical size={20} color={muted} />
          </PressableFeedback>
        </ListGroup.ItemSuffix>
      </ListGroup.Item>
    </ListGroup>
  );
});
