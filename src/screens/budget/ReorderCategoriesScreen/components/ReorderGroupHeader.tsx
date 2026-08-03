import { memo } from "react";
import { View, type AccessibilityActionEvent, type GestureResponderEvent } from "react-native";
import { useTranslation } from "react-i18next";
import { PressableFeedback, Typography, useThemeColor } from "heroui-native";
import { GripVertical } from "lucide-react-native";

/**
 * A group's name in the flat reorder list — the same header the plan editor and
 * the hidden-categories screen draw above their cards (`EditPlanGroup`), so the
 * two screens read as the same list.
 *
 * It carries no drag handle: with no way to pick it up, the library leaves it
 * where it is, and a fixed header is precisely what makes it a group boundary the
 * drop arithmetic can trust (see `resolveCategoryDrop`).
 *
 * Holding it is how you get at the groups themselves. That collapses the
 * categories away and hands the same press on to the group's own row, which *is*
 * draggable — so from the user's side one long press picks up a whole group.
 */
export const ReorderGroupHeader = memo(function ReorderGroupHeader({
  groupId,
  name,
  isFirst,
  canGrab,
  onGrab,
}: {
  groupId: string;
  name: string;
  /** The first header sits under the floating header, so it skips the top gap. */
  isFirst: boolean;
  /** False when there's only one group to order — nothing to hold it for. */
  canGrab: boolean;
  /** `fingerY` is null when the press wasn't a finger — see the rotor action. */
  onGrab: (groupId: string, fingerY: number | null) => void;
}) {
  const { t } = useTranslation("budget");
  const muted = useThemeColor("muted");

  // Where the finger is, so the group row that replaces this header can come up
  // to meet it instead of appearing wherever the collapse left it. The haptic for
  // the lift belongs to the mode change, not to this one way of asking for it, so
  // it fires in `enterGroupMode` instead.
  const grab = (event: GestureResponderEvent) => {
    onGrab(groupId, event.nativeEvent.pageY);
  };

  // Holding is unreachable with a screen reader on, so entering group mode is
  // offered as a rotor action instead. It collapses the list without picking
  // anything up — there's no finger to hand the drag on to — and the group rows
  // carry their own move actions from there.
  const actions = canGrab
    ? [{ name: "reorderGroups", label: t("reorderScreen.reorderGroups") }]
    : [];
  const onAccessibilityAction = (event: AccessibilityActionEvent) => {
    if (event.nativeEvent.actionName === "reorderGroups") onGrab(groupId, null);
  };

  const label = (
    <View className="flex-row items-center gap-1">
      <Typography className="text-sm font-semibold text-foreground" numberOfLines={1}>
        {name}
      </Typography>
      {canGrab ? <GripVertical size={14} color={muted} /> : null}
    </View>
  );

  return (
    <View className={isFirst ? "px-1 pb-1" : "px-1 pb-1 pt-4"}>
      {canGrab ? (
        <PressableFeedback
          onLongPress={grab}
          delayLongPress={220}
          hitSlop={8}
          accessibilityRole="header"
          accessibilityLabel={name}
          accessibilityHint={t("reorderScreen.headerHint")}
          accessibilityActions={actions}
          onAccessibilityAction={onAccessibilityAction}
        >
          {label}
        </PressableFeedback>
      ) : (
        <View accessibilityRole="header">{label}</View>
      )}
    </View>
  );
});
