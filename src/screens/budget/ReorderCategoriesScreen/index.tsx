import { useCallback, useEffect, useRef, useState } from "react";
import { AccessibilityInfo, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { Button, Typography } from "heroui-native";
import { EmptyState } from "heroui-native-pro";
import { ScreenHeader } from "@/ui/ScreenHeader";
import { lightHaptic, mediumHaptic } from "@/ui/haptics";
import { useBudgetSections } from "@/screens/budget/hooks/useBudgetSections";
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
 * group lands. Everything the screen does goes through {@link moveCategory} /
 * {@link moveCategoryGroup} — already a faithful port of upstream's sort-order
 * shove — so nothing here decides where a row goes in the database, only which
 * call describes the drop.
 */
export function ReorderCategoriesScreen() {
  const { t } = useTranslation("budget");
  const { t: tCommon } = useTranslation("common");
  const insets = useSafeAreaInsets();
  const { sections, isLoading } = useBudgetSections();

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

  const done = useCallback(() => {
    lightHaptic();
    exitGroupMode();
  }, [exitGroupMode]);

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

  // Nothing to order yet — the plan editor is where groups get created, so this
  // only points back the way the user came.
  const isEmpty = !isLoading && sections.length === 0;

  return (
    <ScreenHeader.ScrollArea>
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
          groupMode={groupMode}
          grab={grab}
          onEnterGroupMode={enterGroupMode}
          onExitGroupMode={exitGroupMode}
        />
      )}

      <ScreenHeader.Floating>
        {/* A plain push, so the header pays for its own status bar — the same as
            HiddenCategoriesScreen. */}
        <View style={{ height: insets.top }} />
        <ScreenHeader>
          <ScreenHeader.Back />
          <ScreenHeader.Title>{t("reorder")}</ScreenHeader.Title>
          <ScreenHeader.Actions>
            {/* The way out when a group was picked up and never dropped. Dropping
                one leaves group mode by itself. */}
            {groupMode ? (
              <Button size="sm" variant="secondary" className="rounded-full" onPress={done}>
                <Button.Label>{tCommon("done")}</Button.Label>
              </Button>
            ) : null}
          </ScreenHeader.Actions>
        </ScreenHeader>
        {/* Always one line, in both modes: a hint that came and went would resize
            the floating header, and the list pads itself by its measured height. */}
        {!isEmpty ? (
          <Typography numberOfLines={1} className="px-4 pb-3 text-xs text-muted">
            {groupMode ? t("reorderScreen.groupModeHint") : t("reorderScreen.headerHint")}
          </Typography>
        ) : null}
      </ScreenHeader.Floating>
    </ScreenHeader.ScrollArea>
  );
}
