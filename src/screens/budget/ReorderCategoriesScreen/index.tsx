import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, View } from "react-native";
import { useTranslation } from "react-i18next";
import { usePreventRemove } from "@react-navigation/native";
import type { NativeStackNavigationOptions } from "@react-navigation/native-stack";
import { Stack, useNavigation, useRouter } from "expo-router";
import { useThemeColor } from "heroui-native";
import { EmptyState } from "heroui-native-pro";
import { Check } from "lucide-react-native";
import { applyCategoryOrder } from "@/core/server/budget/apply-order";
import { emitErrorEvent } from "@/lib/errors/ErrorChannel";
import { dialog } from "@/ui/feedback/dialog";
import { useHeaderActionOptions } from "@/ui/header-actions/useHeaderActionOptions";
import type { HeaderAction } from "@/ui/header-actions/types";
import { mediumHaptic, successHaptic } from "@/ui/haptics";
import { useBudgetSections } from "@/screens/budget/hooks/useBudgetSections";
import { toCategoryOrder } from "./lib/reorderModel";
import { useLocalOrder } from "./hooks/useLocalOrder";
import { ReorderList, type GroupGrab } from "./components/ReorderList";

/**
 * Drag categories into the order you want them budgeted in — within a group,
 * into another group, or the groups themselves.
 *
 * Reached from the plan editor's overflow menu. It's a separate screen rather
 * than an edit mode on the plan editor because the two want opposite things from
 * a row: the editor's rows are buttons into a category, and here a press has to
 * mean "pick this up".
 *
 * One list, in one of two shapes. A drag library moves one row at a time, so
 * dragging a group would have to carry its categories with it, which it can't —
 * instead, holding a group's name takes the categories off the screen, leaving
 * the groups as the only thing there is to move. They come back the moment the
 * group lands.
 *
 * Nothing is written until the check in the header is pressed. Reordering is a
 * session rather than a series of edits: you shuffle things until the list reads
 * right, and *then* commit — one {@link applyCategoryOrder}, one undo step. So
 * leaving early costs nothing, which is exactly why leaving with unapplied moves
 * asks first.
 */
export function ReorderCategoriesScreen() {
  const { t } = useTranslation("budget");
  const { t: tCommon } = useTranslation("common");
  const router = useRouter();
  const navigation = useNavigation();
  const accent = useThemeColor("accent");
  const { sections, isLoading } = useBudgetSections();
  const order = useLocalOrder(sections);

  const [groupMode, setGroupMode] = useState(false);
  // The press that opened group mode, until the group's row has taken it over.
  const [grab, setGrab] = useState<GroupGrab | null>(null);

  // The lift lives here rather than on the header's long press so that both doors
  // into group mode — the finger and VoiceOver's rotor action — knock once. Half
  // the screen empties either way; the gesture that asked for it doesn't matter.
  const enterGroupMode = useCallback((groupId: string, fingerY: number | null) => {
    mediumHaptic();
    setGroupMode(true);
    setGrab(fingerY == null ? null : { groupId, fingerY });
  }, []);

  const exitGroupMode = useCallback(() => {
    setGrab(null);
    setGroupMode(false);
  }, []);

  /**
   * Leave once the order is safely written — as an effect rather than straight
   * after the await, so the render that clears `dirty` lands first. Going back in
   * the same tick would meet the guard below still armed and be asked to confirm
   * discarding the very changes we just saved.
   */
  const [applied, setApplied] = useState(false);
  useEffect(() => {
    if (applied) router.back();
  }, [applied, router]);

  const apply = useCallback(async () => {
    try {
      await applyCategoryOrder(toCategoryOrder(order.groups, order.categories));
      successHaptic();
      order.reset();
      setApplied(true);
    } catch (error) {
      emitErrorEvent(error);
    }
  }, [order]);

  // Reordering is cheap to redo but invisible once gone: there is no draft to
  // come back to, so a back gesture over unapplied moves asks before dropping
  // them. Native forms do the same.
  usePreventRemove(order.dirty && !applied, ({ data }) => {
    dialog
      .confirm({
        title: t("reorderScreen.discardTitle"),
        message: t("reorderScreen.discardMessage"),
        confirmLabel: t("reorderScreen.discard"),
        destructive: true,
      })
      .then((discard) => {
        if (discard) navigation.dispatch(data.action);
      })
      .catch(emitErrorEvent);
  });

  // Nothing to order yet — the plan editor is where groups get created, so this
  // only points back the way the user came.
  const isEmpty = !isLoading && sections.length === 0;

  // One action, one meaning: the check commits the arrangement, in either mode.
  // Group mode used to put a "Done" button here, but a second header button
  // that looks the same and does something else is a trap — and group mode
  // already ends by itself the moment a group is dropped, moved or not.
  const action = useMemo<HeaderAction | undefined>(() => {
    if (isEmpty) return undefined;
    return {
      label: tCommon("save"),
      icon: { sfSymbol: "checkmark", lucide: Check },
      emphasis: "done",
      // A "done" action draws a filled capsule on iOS 26 whose fill comes from
      // the system accent, not from the bar's tint.
      tintColor: accent,
      disabled: !order.dirty,
      onPress: apply,
    };
  }, [isEmpty, tCommon, accent, order.dirty, apply]);

  const actionOptions = useHeaderActionOptions({ right: action });
  const headerOptions = useMemo<NativeStackNavigationOptions>(
    () => ({
      ...actionOptions,
      title: t("reorder"),
      // This screen is dragged across, and the back-swipe starts at the same
      // edge — a drag that begins slightly too far left would leave instead of
      // moving a row. The chevron and the check are the ways out; the discard
      // prompt above still guards the chevron.
      gestureEnabled: false,
    }),
    [actionOptions, t],
  );

  // Half the rows leaving the screen is silent to a screen reader, so the mode is
  // said out loud instead. Driven off the state rather than the callbacks, which
  // are also called for releases that changed nothing.
  const announced = useRef(groupMode);
  useEffect(() => {
    if (announced.current === groupMode) return;
    announced.current = groupMode;
    AccessibilityInfo.announceForAccessibility(
      t(groupMode ? "reorderScreen.groupModeOn" : "reorderScreen.groupModeOff"),
    );
  }, [groupMode, t]);

  return (
    <>
      <Stack.Screen options={headerOptions} />
      {isEmpty ? (
        <View className="flex-1 items-center justify-center px-8">
          <EmptyState>
            <EmptyState.Header>
              <EmptyState.Title>{t("noCategoryGroupsYet")}</EmptyState.Title>
              <EmptyState.Description>{t("organizeByCreating")}</EmptyState.Description>
            </EmptyState.Header>
          </EmptyState>
        </View>
      ) : isLoading ? null : (
        <ReorderList
          sections={sections}
          order={order}
          groupMode={groupMode}
          grab={grab}
          onEnterGroupMode={enterGroupMode}
          onExitGroupMode={exitGroupMode}
          hint={groupMode ? t("reorderScreen.groupModeHint") : t("reorderScreen.headerHint")}
        />
      )}
    </>
  );
}
