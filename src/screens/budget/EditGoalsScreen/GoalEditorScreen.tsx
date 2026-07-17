import { useCallback, useEffect, useState } from "react";
import { Alert, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { Button } from "heroui-native";
import { CircleCheck, Trash2 } from "lucide-react-native";
import { amountCentsOf, withAmountCents } from "@/core/domain/goals";
import { AmountKeyboard } from "@/ui/amount-keyboard";
import { ScreenHeader } from "@/ui/ScreenHeader";
import { GoalEditorPane } from "./components/GoalEditorPane";
import { useGoalAutomationsContext } from "./context/GoalAutomationsProvider";
import { displayTypeMeta } from "./displayTypeMeta";

/** Panel height assumed until the keyboard reports its measured one. */
const KEYBOARD_HEIGHT_FALLBACK = 340;
/** The button's resting distance from the bottom edge. */
const BUTTON_BOTTOM = 32;
/** Gap between the raised button and the keyboard's top edge. */
const BUTTON_KEYBOARD_GAP = 16;

/**
 * One automation of the category — a pushed screen of the goal stack, so
 * entering and leaving it get the native transition. Edits mutate the shared
 * draft; the floating button is the screen's single action and reads the
 * state: with unsaved changes it saves the target, otherwise it deletes it.
 *
 * The screen owns the AmountKeyboard: our keypad isn't the system keyboard,
 * so no KeyboardAvoidingView will move the button — instead the button's
 * bottom offset animates by the panel's reported height when it opens.
 */
export function GoalEditorScreen() {
  const { t } = useTranslation("budget");
  const router = useRouter();
  const { entryId } = useLocalSearchParams<{ entryId: string }>();

  const {
    entries,
    schedules,
    usedTypes,
    errorsByEntry,
    moveRangeFor,
    isDirty,
    isSaving,
    hasErrors,
    updateEntry,
    changeEntryType,
    moveEntry,
    deleteEntry,
    save,
  } = useGoalAutomationsContext();

  const entry = entries.find((e) => e.id === entryId);

  const [amountOpen, setAmountOpen] = useState(false);
  const keyboardHeight = useSharedValue(KEYBOARD_HEIGHT_FALLBACK);
  const buttonBottom = useSharedValue(BUTTON_BOTTOM);

  useEffect(() => {
    buttonBottom.value = withTiming(
      amountOpen ? keyboardHeight.value + BUTTON_KEYBOARD_GAP : BUTTON_BOTTOM,
      { duration: 250 },
    );
  }, [amountOpen, buttonBottom, keyboardHeight]);

  const buttonStyle = useAnimatedStyle(() => ({ bottom: buttonBottom.value }));

  // Deleted (or state got reset) while this screen was up — nothing to edit.
  useEffect(() => {
    if (!entry) router.back();
  }, [entry, router]);

  const handleSave = useCallback(async () => {
    await save();
    router.back();
  }, [save, router]);

  const confirmDelete = useCallback(() => {
    if (!entry) return;
    Alert.alert(t("goals.deleteTitle"), t("goals.deleteMessage"), [
      { text: t("goals.cancel"), style: "cancel" },
      {
        text: t("goals.delete"),
        style: "destructive",
        onPress: () => {
          deleteEntry(entry.id);
          router.back();
        },
      },
    ]);
  }, [entry, deleteEntry, router, t]);

  if (!entry) return null;

  const { canMoveUp, canMoveDown } = moveRangeFor(entry.id);
  const cents = amountCentsOf(entry.template);

  return (
    <AmountKeyboard
      isOpen={amountOpen}
      onOpenChange={setAmountOpen}
      value={cents ?? 0}
      onValueChange={(next) => updateEntry(entry.id, withAmountCents(entry.template, next))}
    >
      <View className="flex-1">
        <ScreenHeader.ScrollArea>
          <ScreenHeader.Body contentContainerStyle={{ paddingBottom: 140 }}>
            <GoalEditorPane
              entry={entry}
              schedules={schedules}
              usedTypes={usedTypes}
              error={errorsByEntry.get(entry.id)}
              canMoveUp={canMoveUp}
              canMoveDown={canMoveDown}
              onChange={(template) => updateEntry(entry.id, template)}
              onChangeType={(displayType) => changeEntryType(entry.id, displayType)}
              onMove={(direction) => moveEntry(entry.id, direction)}
              onOpenModePane={(custom) =>
                router.push({
                  pathname: "/(auth)/budget/goal/mode",
                  params: { entryId: entry.id, ...(custom ? { custom: "1" } : {}) },
                })
              }
            />
          </ScreenHeader.Body>

          <ScreenHeader.Floating>
            <ScreenHeader>
              <ScreenHeader.Back onPress={() => router.back()} />
              <ScreenHeader.Title>
                {t(displayTypeMeta[entry.displayType].labelKey)}
              </ScreenHeader.Title>
            </ScreenHeader>
          </ScreenHeader.Floating>
        </ScreenHeader.ScrollArea>

        {/* The screen's single action: unsaved changes save the target,
            otherwise the target can be deleted. Rides above the keypad. */}
        <Animated.View className="absolute right-5" style={buttonStyle}>
          {isDirty ? (
            <Button
              className="h-14 rounded-full px-6 shadow-lg"
              isDisabled={hasErrors || isSaving}
              onPress={handleSave}
            >
              <CircleCheck size={18} color="white" />
              <Button.Label>{t("goals.saveTarget")}</Button.Label>
            </Button>
          ) : (
            <Button
              variant="danger"
              className="h-14 rounded-full px-6 shadow-lg"
              onPress={confirmDelete}
            >
              <Trash2 size={18} color="white" />
              <Button.Label>{t("goals.delete")}</Button.Label>
            </Button>
          )}
        </Animated.View>
      </View>

      <AmountKeyboard.Portal>
        <AmountKeyboard.Panel
          onHeightChange={(height) => {
            keyboardHeight.value = height;
            // Re-aim an in-flight rise once the real height is known.
            buttonBottom.value = withTiming(height + BUTTON_KEYBOARD_GAP, { duration: 150 });
          }}
        />
      </AmountKeyboard.Portal>
    </AmountKeyboard>
  );
}
