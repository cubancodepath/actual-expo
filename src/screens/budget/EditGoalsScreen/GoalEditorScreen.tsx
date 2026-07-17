import { useCallback, useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useStore } from "@tanstack/react-form";
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
 * entering and leaving it get the native transition. Edits live in the
 * session's form; back simply pops and the draft evaporates. The floating
 * button is the screen's single action: a new or dirty draft saves, an
 * untouched saved target deletes.
 *
 * The screen owns the AmountKeyboard: our keypad isn't the system keyboard,
 * so no KeyboardAvoidingView will move the button — instead the button's
 * bottom offset animates by the panel's reported height when it opens.
 */
export function GoalEditorScreen() {
  const { t } = useTranslation("budget");
  const router = useRouter();

  const { form, schedules, changeType, deleteEntry, validateDraftValues, isSaving } =
    useGoalAutomationsContext();

  const values = useStore(form.store, (s) => s.values);
  const isDirty = useStore(form.store, (s) => s.isDirty);
  const { template, displayType, entryId } = values;

  // The display side of the form's zod gate — same domain validators, but as
  // rich error objects the messages can interpolate.
  const draft = useMemo(() => validateDraftValues(values), [values, validateDraftValues]);
  const isValid = draft.error == null && draft.conflicts.length === 0;

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

  // Save navigates back itself (the mutation's onSuccess) — a failed save
  // stays here with the draft intact.
  const handleSave = useCallback(() => form.handleSubmit(), [form]);

  // No confirmation: deleting persists at once.
  const handleDelete = useCallback(async () => {
    if (entryId == null) return;
    await deleteEntry(entryId);
    router.back();
  }, [entryId, deleteEntry, router]);

  const cents = amountCentsOf(template);
  const showSave = entryId == null || isDirty;

  return (
    <AmountKeyboard
      isOpen={amountOpen}
      onOpenChange={setAmountOpen}
      value={cents ?? 0}
      onValueChange={(next) => form.setFieldValue("template", withAmountCents(template, next))}
    >
      <View className="flex-1">
        <ScreenHeader.ScrollArea>
          <ScreenHeader.Body contentContainerStyle={{ paddingBottom: 140 }}>
            <GoalEditorPane
              template={template}
              displayType={displayType}
              schedules={schedules}
              error={draft.error ?? undefined}
              conflicts={draft.conflicts}
              onChange={(next) => form.setFieldValue("template", next)}
              onChangeType={changeType}
              onOpenModePane={(custom) =>
                router.push({
                  pathname: "/(auth)/budget/goal/mode",
                  params: custom ? { custom: "1" } : {},
                })
              }
            />
          </ScreenHeader.Body>

          <ScreenHeader.Floating>
            <ScreenHeader>
              {/* Back discards by construction: the draft only exists in the
                  form, so popping the screen is the whole revert. */}
              <ScreenHeader.Back onPress={() => router.back()} />
              <ScreenHeader.Title>{t(displayTypeMeta[displayType].labelKey)}</ScreenHeader.Title>
            </ScreenHeader>
          </ScreenHeader.Floating>
        </ScreenHeader.ScrollArea>

        {/* The screen's single action: a new or edited draft saves the
            target, an untouched saved one can be deleted. Rides above the
            keypad. */}
        <Animated.View className="absolute right-5" style={buttonStyle}>
          {showSave ? (
            <Button
              className="h-14 rounded-full px-6 shadow-lg"
              isDisabled={!isValid || isSaving}
              onPress={handleSave}
            >
              <CircleCheck size={18} color="white" />
              <Button.Label>{t("goals.saveTarget")}</Button.Label>
            </Button>
          ) : (
            <Button
              variant="danger"
              className="h-14 rounded-full px-6 shadow-lg"
              isDisabled={isSaving}
              onPress={handleDelete}
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
