import { memo, useEffect, useRef } from "react";
import { View, type AccessibilityActionEvent } from "react-native";
import { useTranslation } from "react-i18next";
import { cn, ListGroup, PressableFeedback, Separator, useThemeColor } from "heroui-native";
import { GripVertical } from "lucide-react-native";
import { useIsActive, useReorderableDrag } from "react-native-reorderable-list";
import { mediumHaptic } from "@/ui/haptics";
import type { ReorderGroupRowData } from "../lib/reorderModel";

/**
 * A whole group as one row, shown while the categories are collapsed. Same
 * anatomy as {@link ReorderCategoryRow} — one card faked per row so the list
 * matches the rest of the app — with the number of categories underneath the
 * name, since the group's contents are what's moving and they aren't on screen.
 */
export const ReorderGroupRow = memo(function ReorderGroupRow({
  row,
  index,
  isFirst,
  isLast,
  canMoveUp,
  canMoveDown,
  onMove,
  grabFingerY,
  onAutoGrab,
}: {
  row: ReorderGroupRowData;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMove: (from: number, to: number) => void;
  /**
   * Page Y of the long press that collapsed the list, when it was this group's
   * name that was held. Null for every other row and for every later render.
   */
  grabFingerY: number | null;
  /** Told how far this row has to move to sit under that finger. */
  onAutoGrab: (offset: number) => void;
}) {
  const { t } = useTranslation("budget");
  const drag = useReorderableDrag();
  const isDragging = useIsActive();
  const muted = useThemeColor("muted");
  const viewRef = useRef<View>(null);

  const startDrag = () => {
    mediumHaptic();
    drag();
  };

  /**
   * Take over the press that collapsed the list.
   *
   * The header the user is holding is gone and this row has taken its cell, so
   * the drag can just be started — the library only asks that the list be idle,
   * which it is, and the finger is still down. What it can't do by itself is
   * appear in the right place: the collapse moved this group up past every
   * category that used to be above it, and a dragged row is drawn at its own
   * position plus how far the finger has travelled since it landed. So the offset
   * back to the finger is measured here and handed up; the list holds the row
   * there and lets it glide home.
   *
   * A frame is allowed to pass first because the cells write their sizes on
   * layout, and the pick-up reads this row's.
   *
   * Note it calls `drag()` and not the local `startDrag()`: the lift was already
   * felt when the header was held a couple of frames ago, and this is the same
   * gesture. Routing it through the wrapper would knock twice for one press.
   */
  const grabbed = useRef(false);
  useEffect(() => {
    if (grabFingerY == null || grabbed.current) return;
    grabbed.current = true;

    const frame = requestAnimationFrame(() => {
      viewRef.current?.measureInWindow((_x, y, _width, height) => {
        // A row that hasn't been laid out would give a nonsense offset; better to
        // leave the user in the collapsed list, where a second hold still works.
        if (height <= 0) return;
        onAutoGrab(grabFingerY - (y + height / 2));
        drag();
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [grabFingerY, onAutoGrab, drag]);

  const actions = [
    ...(canMoveUp ? [{ name: "moveUp", label: t("reorderScreen.moveUp") }] : []),
    ...(canMoveDown ? [{ name: "moveDown", label: t("reorderScreen.moveDown") }] : []),
  ];

  const onAccessibilityAction = (event: AccessibilityActionEvent) => {
    if (event.nativeEvent.actionName === "moveUp") onMove(index, index - 1);
    if (event.nativeEvent.actionName === "moveDown") onMove(index, index + 1);
  };

  return (
    <View ref={viewRef}>
      <ListGroup
        className={cn(
          "rounded-none",
          isFirst && "rounded-t-2xl",
          isLast && "rounded-b-2xl",
          isDragging && "rounded-2xl",
        )}
      >
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
            <ListGroup.ItemDescription>
              {t("reorderScreen.nCategories", { count: row.categoryCount })}
            </ListGroup.ItemDescription>
          </ListGroup.ItemContent>
          <ListGroup.ItemSuffix>
            <PressableFeedback
              onLongPress={startDrag}
              delayLongPress={120}
              hitSlop={12}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              <GripVertical size={20} color={muted} />
            </PressableFeedback>
          </ListGroup.ItemSuffix>
        </ListGroup.Item>
      </ListGroup>
    </View>
  );
});
