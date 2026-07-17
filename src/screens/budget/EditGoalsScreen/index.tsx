import { useCallback } from "react";
import { Alert, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Button, Spinner, Typography } from "heroui-native";
import { ScreenHeader } from "@/ui/ScreenHeader";
import { CloseButton } from "@/ui/CloseButton";
import { useCategories } from "@/hooks/useCategories";
import { GoalListPane } from "./components/GoalListPane";
import { useGoalAutomationsContext } from "./context/GoalAutomationsProvider";

/**
 * Edit Goals — the list screen of the goal stack (`/(auth)/budget/goal`).
 *
 * The stack mirrors the transaction modal: a card modal containing its own
 * native stack (list → editor → mode), with the draft held above it in
 * GoalAutomationsProvider so pushes and pops keep the in-progress edits.
 */
export function GoalsListScreen() {
  const { t } = useTranslation("budget");
  const router = useRouter();
  const { categoryId } = useLocalSearchParams<{ categoryId: string }>();
  const { categories } = useCategories();
  const category = categories.find((c) => c.id === categoryId);

  const {
    entries,
    schedules,
    isLoading,
    loadError,
    isSaving,
    isDirty,
    importedFromNotes,
    errorsByEntry,
    conflicts,
    hasErrors,
    addEntry,
    save,
    removeAll,
    dismiss,
  } = useGoalAutomationsContext();

  const openEntry = useCallback(
    (entryId: string) => {
      router.push({ pathname: "/(auth)/budget/goal/editor", params: { entryId } });
    },
    [router],
  );

  // No type question on the way in: a recurring amount is what a goal almost
  // always is, and the editor's "Change goal type" covers the rest.
  const handleAdd = useCallback(() => {
    const entry = addEntry("fixed");
    openEntry(entry.id);
  }, [addEntry, openEntry]);

  const handleClose = useCallback(() => {
    if (!isDirty) {
      dismiss();
      return;
    }
    Alert.alert(t("goals.discardTitle"), t("goals.discardMessage"), [
      { text: t("goals.keepEditing"), style: "cancel" },
      { text: t("goals.discard"), style: "destructive", onPress: dismiss },
    ]);
  }, [isDirty, dismiss, t]);

  const handleSave = useCallback(async () => {
    await save();
    dismiss();
  }, [save, dismiss]);

  const handleRemoveAll = useCallback(async () => {
    await removeAll();
    dismiss();
  }, [removeAll, dismiss]);

  return (
    <ScreenHeader.ScrollArea>
      <ScreenHeader.Body contentContainerStyle={{ paddingBottom: 40 }}>
        {isLoading ? (
          <View className="items-center py-12">
            <Spinner />
          </View>
        ) : loadError ? (
          <View className="items-center gap-2 px-6 py-12">
            <Typography className="text-center text-sm text-danger">
              {t("goals.loadError")}
            </Typography>
          </View>
        ) : (
          <GoalListPane
            entries={entries}
            schedules={schedules}
            errorsByEntry={errorsByEntry}
            conflicts={conflicts}
            importedFromNotes={importedFromNotes}
            isSaving={isSaving}
            onOpenEntry={openEntry}
            onAddGoal={handleAdd}
            onRemoveAll={handleRemoveAll}
          />
        )}
      </ScreenHeader.Body>

      <ScreenHeader.Floating>
        <ScreenHeader>
          <ScreenHeader.Back>
            <CloseButton onPress={handleClose} />
          </ScreenHeader.Back>
          <ScreenHeader.Title>{category?.name ?? t("goals.title")}</ScreenHeader.Title>
          <ScreenHeader.Actions>
            <Button isDisabled={!isDirty || hasErrors || isSaving} onPress={handleSave}>
              <Button.Label>{t("goals.done")}</Button.Label>
            </Button>
          </ScreenHeader.Actions>
        </ScreenHeader>
      </ScreenHeader.Floating>
    </ScreenHeader.ScrollArea>
  );
}
