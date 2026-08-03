import { useCallback, useMemo, useRef } from "react";
import { Platform, StyleSheet, View, type DimensionValue } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { ListGroup, Typography, useToast } from "heroui-native";
import { Easing, runOnJS, useSharedValue, withTiming } from "react-native-reanimated";
import ReorderableList, {
  type ReorderableListDragEndEvent,
  type ReorderableListReorderEvent,
} from "react-native-reorderable-list";
import { lightHaptic, selectionHaptic, warningHaptic } from "@/ui/haptics";
import { useCategories } from "@/lib/hooks/useCategories";
import {
  cornersAt,
  hasDuplicateName,
  moveRow,
  resolveCategoryDrop,
  resolveGroupDrop,
  withGroupPatched,
  type UnifiedRow,
} from "../lib/reorderModel";
import { ReorderCategoryRow } from "./ReorderCategoryRow";
import { ReorderGroupHeader } from "./ReorderGroupHeader";
import { ReorderGroupRow } from "./ReorderGroupRow";
import type { LocalOrder } from "../hooks/useLocalOrder";
import type { BudgetSection } from "@/screens/budget/hooks/useBudgetSections";

/** Where the finger was, and on which group, when group mode was entered. */
export interface GroupGrab {
  groupId: string;
  /** Page Y of the long press, so the picked-up row can meet the finger. */
  fingerY: number;
}

/** How long the grabbed row takes to glide from the finger to its own position. */
const SETTLE_DURATION = 220;

/**
 * Shortest gap between two drag ticks.
 *
 * One tick per row crossed is the point, and a hand can't cross rows faster than
 * this. Autoscroll can: with the row parked in the scroll zone the list keeps
 * feeding index changes at frame rate, and without a gate that arrives as a
 * rattle instead of as detents.
 */
const TICK_INTERVAL = 60;

/**
 * How far the navigation bar reaches down the screen.
 *
 * The list runs full-bleed under a translucent header, so the top of its own
 * frame is not the top of what you can see — and the autoscroll trigger is
 * measured from that frame (`computeThresholdArea`), which would put the upward
 * trigger behind the bar, over rows that are hidden by it. Offsetting it by the
 * bar brings it back onto visible content.
 *
 * Standard bar metrics rather than the measured height, because reading the real
 * one means taking on `@react-navigation/elements` for a single number; being a
 * couple of points out just shifts where autoscroll begins.
 */
const NAV_BAR_HEIGHT = Platform.select({ ios: 44, default: 56 });

/**
 * Everything reorderable, in one list, in one of two shapes.
 *
 * Normally it shows every category with its group's name above it, and a drag
 * moves one category — within its group or into another one. Hold a group's name
 * instead and the categories collapse away, leaving just the groups, so the thing
 * being dragged is the whole group. They come back as soon as it's dropped.
 *
 * Both shapes are the same list on purpose: a group keeps its key across the
 * collapse (see `toGroupRows`), so its cell survives, its name row morphs into a
 * group row rather than blinking, and — because the cell is still there — the
 * long press that collapsed the list can go straight on to drag it.
 *
 * Nothing here writes. A drop rearranges {@link LocalOrder} and stops; the screen's
 * header is what commits the arrangement. What a drop *does* decide is whether it
 * is allowed at all — a category can't cross the income line, land outside a
 * group, or join a group that already has its name — so a refused drop snaps back
 * and never enters the order in the first place.
 */
export function ReorderList({
  sections,
  order,
  groupMode,
  grab,
  onEnterGroupMode,
  onExitGroupMode,
  hint,
}: {
  sections: BudgetSection[];
  order: LocalOrder;
  groupMode: boolean;
  /**
   * The press that opened group mode, for the group's row to take over. Held
   * until group mode ends — every way out of it clears the grab, and clearing it
   * any earlier would re-render the cell the user is still dragging.
   */
  grab: GroupGrab | null;
  onEnterGroupMode: (groupId: string, fingerY: number | null) => void;
  onExitGroupMode: () => void;
  /** One line above the list saying what the current mode can do. */
  hint: string;
}) {
  const { t } = useTranslation("budget");
  const insets = useSafeAreaInsets();
  const { toast } = useToast();
  // Raw categories, hidden ones included — the duplicate-name check has to see
  // namesakes the sections leave out.
  const { categories } = useCategories();

  const { groups: groupRows, categories: categoryRows, moveCategories, moveGroups, revert } = order;

  const rows: UnifiedRow[] = groupMode ? groupRows : categoryRows;
  // One group has nowhere to go, so its name doesn't offer to be held.
  const canReorderGroups = groupRows.length > 1;
  const income = sections.find((s) => s.is_income);

  /**
   * Offsets the picked-up group row while it catches up with the finger.
   *
   * Collapsing the categories moves a group a long way up the list, but the drag
   * library places a dragged row at its own position plus however far the finger
   * has travelled — which would leave the row hanging hundreds of pixels above the
   * hand that grabbed it. So the row is nudged back down to where the finger
   * actually is and then glides home over {@link SETTLE_DURATION}. Only ever
   * applied to a dragged cell (`cellAnimations`), so it costs nothing otherwise.
   */
  // Typed as the style property it feeds rather than as a plain number, which is
  // what `cellAnimations` expects to merge into the dragged cell's style.
  const settle = useSharedValue<DimensionValue | undefined>(0);
  const cellAnimations = useMemo(() => ({ top: settle }), [settle]);

  const refuse = useCallback(
    (message: string) => {
      warningHaptic();
      revert();
      toast.show({ placement: "bottom", variant: "warning", label: message });
    },
    [revert, toast],
  );

  /**
   * Turn a landed category into a move. Both the drag and the accessibility
   * actions come through here, so the rules are enforced in exactly one place.
   */
  const reorderCategory = useCallback(
    ({ from, to }: ReorderableListReorderEvent) => {
      if (from === to) return;

      const next = moveRow(categoryRows, from, to);
      const drop = resolveCategoryDrop(next, to);
      if (!drop.ok) {
        refuse(
          drop.reason === "income-boundary"
            ? t("reorderScreen.incomeBoundary")
            : t("reorderScreen.noGroupThere"),
        );
        return;
      }
      if (
        drop.isCrossGroup &&
        hasDuplicateName(categories, drop.name, drop.groupId, drop.categoryId)
      ) {
        refuse(t("reorderScreen.duplicateName", { name: drop.name }));
        return;
      }

      lightHaptic();
      moveCategories(withGroupPatched(next, to, drop.groupId));
    },
    [categoryRows, moveCategories, categories, refuse, t],
  );

  /** Turn a landed group into a move. Nothing here can be refused. */
  const moveGroup = useCallback(
    (from: number, to: number) => {
      if (from === to) return;
      const next = moveRow(groupRows, from, to);
      const drop = resolveGroupDrop(next, to);
      if (!drop) return;
      lightHaptic();
      moveGroups(next);
    },
    [groupRows, moveGroups],
  );

  /** A dragged group landed: keep it, then give the categories back. */
  const reorderGroup = useCallback(
    ({ from, to }: ReorderableListReorderEvent) => {
      moveGroup(from, to);
      onExitGroupMode();
    },
    [moveGroup, onExitGroupMode],
  );

  const reorder = groupMode ? reorderGroup : reorderCategory;

  /**
   * A release that didn't move anything never reaches `onReorder`, so group mode
   * would have no way out but the Done button. Picking a group up and putting it
   * straight back down should end the same way as moving it.
   */
  const onRelease = useCallback(
    (from: number, to: number) => {
      if (from === to) onExitGroupMode();
    },
    [onExitGroupMode],
  );

  const onDragEnd = useCallback(
    (event: ReorderableListDragEndEvent) => {
      "worklet";
      runOnJS(onRelease)(event.from, event.to);
    },
    [onRelease],
  );

  /**
   * A tick per row crossed, so the order can be felt changing without watching it
   * — the same beat the system's own reorder gives you. The library fires this
   * only on a *change* of index, never on the pick-up, so it can't double with the
   * lift; the gate is for autoscroll, which does repeat.
   */
  const lastTick = useRef(0);
  const tick = useCallback(() => {
    const now = Date.now();
    if (now - lastTick.current < TICK_INTERVAL) return;
    lastTick.current = now;
    selectionHaptic();
  }, []);

  const onIndexChange = useCallback(() => {
    "worklet";
    runOnJS(tick)();
  }, [tick]);

  /**
   * The collapsed row measured itself against the finger and is about to pick
   * itself up. `offset` is how far it has to be pushed to sit under the hand.
   */
  const onAutoGrab = useCallback(
    (offset: number) => {
      settle.value = offset;
      settle.value = withTiming(0, { duration: SETTLE_DURATION, easing: Easing.out(Easing.quad) });
    },
    [settle],
  );

  /**
   * The screen-reader path. It moves the same rows through the same rules, but
   * it isn't a drag: stepping a group one place must not close group mode, or a
   * VoiceOver user would be thrown back to the categories after every step and
   * have to re-open it to make the next one.
   *
   * Held in a ref so the rows get a callback that doesn't change with the order,
   * which is what makes their memo worth anything.
   */
  const moveRef = useRef<(from: number, to: number) => void>(() => {});
  moveRef.current = groupMode ? moveGroup : (from, to) => reorderCategory({ from, to });
  const onMove = useCallback((from: number, to: number) => moveRef.current(from, to), []);

  const renderItem = useCallback(
    ({ item, index }: { item: UnifiedRow; index: number }) => {
      if (item.kind === "group")
        return (
          <ReorderGroupRow
            row={item}
            index={index}
            isFirst={index === 0}
            isLast={index === rows.length - 1}
            canMoveUp={index > 0}
            canMoveDown={index < rows.length - 1}
            onMove={onMove}
            // Only the group the user is still holding picks itself up.
            grabFingerY={grab?.groupId === item.id ? grab.fingerY : null}
            onAutoGrab={onAutoGrab}
          />
        );

      if (item.kind === "header")
        return (
          <ReorderGroupHeader
            groupId={item.groupId}
            name={item.name}
            isFirst={index === 0}
            canGrab={canReorderGroups}
            onGrab={onEnterGroupMode}
          />
        );

      const { isFirst, isLast } = cornersAt(categoryRows, index);
      return (
        <ReorderCategoryRow
          row={item}
          index={index}
          isFirst={isFirst}
          isLast={isLast}
          // Index 1 is the first row under the first header: there is no
          // position above it that is still inside a group.
          canMoveUp={index > 1}
          canMoveDown={index < rows.length - 1}
          onMove={onMove}
        />
      );
    },
    [rows, categoryRows, onMove, grab, onAutoGrab, canReorderGroups, onEnterGroupMode],
  );

  return (
    <ReorderableList
      data={rows}
      keyExtractor={keyExtractor}
      renderItem={renderItem}
      onReorder={reorder}
      onDragEnd={onDragEnd}
      onIndexChange={onIndexChange}
      cellAnimations={cellAnimations}
      // Lets a row know it's the one in flight (`useIsActive`), which is how it
      // rounds itself off into a card instead of staying a slice of one.
      shouldUpdateActiveItem
      // The native header is translucent and the list floats under it, so the
      // top inset comes from the navigator rather than from a measured height.
      contentInsetAdjustmentBehavior="automatic"
      style={styles.fill}
      contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 24 }}
      autoscrollThresholdOffset={{ start: insets.top + NAV_BAR_HEIGHT }}
      ListHeaderComponent={<Typography className="px-1 pb-2 text-xs text-muted">{hint}</Typography>}
      ListFooterComponent={
        // Income sorts last no matter what its `sort_order` says
        // (`buildBudgetSections`), so it isn't in the draggable set — but a group
        // missing from a screen called "reorder" reads as a bug rather than a
        // rule, so it's shown as a fixed row while the groups are what's moving.
        groupMode && income ? (
          <View className="pt-6">
            <ListGroup className="rounded-2xl opacity-60">
              <ListGroup.Item>
                <ListGroup.ItemContent>
                  <ListGroup.ItemTitle numberOfLines={1}>{income.name}</ListGroup.ItemTitle>
                  <ListGroup.ItemDescription>
                    {t("reorderScreen.incomeLast")}
                  </ListGroup.ItemDescription>
                </ListGroup.ItemContent>
              </ListGroup.Item>
            </ListGroup>
            <Typography className="px-1 pt-2 text-xs text-muted">
              {t("reorderScreen.groupsHint")}
            </Typography>
          </View>
        ) : null
      }
    />
  );
}

function keyExtractor(row: UnifiedRow): string {
  return row.key;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
