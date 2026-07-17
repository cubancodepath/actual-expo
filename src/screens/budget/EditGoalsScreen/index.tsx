import { useCallback } from "react";
import { View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Button, Spinner, Typography } from "heroui-native";
import { Plus } from "lucide-react-native";
import { ScreenHeader } from "@/ui/ScreenHeader";
import { CloseButton } from "@/ui/CloseButton";
import { useCategories } from "@/hooks/useCategories";
import { GoalListPane } from "./components/GoalListPane";
import { useGoalAutomationsContext } from "./context/GoalAutomationsProvider";

/**
 * Edit Goals — the list screen of the goal stack (`/(auth)/budget/goal`).
 *
 * The stack mirrors the transaction modal: a card modal containing its own
 * native stack (list → editor → mode), with the edit session held above it in
 * GoalAutomationsProvider so pushes and pops keep the in-progress edits.
 *
 * Everything this list shows is saved state — edits live in the session's
 * form until their save lands — so closing from here never has anything to
 * discard.
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
    importedFromNotes,
    errorsByEntry,
    conflicts,
    startNew,
    startEdit,
    deleteEntry,
    dismiss,
  } = useGoalAutomationsContext();

  const pushEditor = useCallback(() => {
    router.push("/(auth)/budget/goal/editor");
  }, [router]);

  const openEntry = useCallback(
    (entryId: string) => {
      const entry = entries.find((e) => e.id === entryId);
      if (!entry) return;
      startEdit(entry);
      pushEditor();
    },
    [entries, startEdit, pushEditor],
  );

  // No type question on the way in: a recurring amount is what a goal almost
  // always is, and the editor's "Based on" row covers the rest.
  const handleAdd = useCallback(() => {
    startNew("fixed");
    pushEditor();
  }, [startNew, pushEditor]);

  const handleAddOption = useCallback(
    (type: "limit" | "goal") => {
      startNew(type);
      pushEditor();
    },
    [startNew, pushEditor],
  );

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
            onOpenEntry={openEntry}
            onAddGoal={handleAdd}
            onAddOption={handleAddOption}
            onRemoveOption={(entryId) => void deleteEntry(entryId)}
          />
        )}
      </ScreenHeader.Body>

      <ScreenHeader.Floating>
        <ScreenHeader>
          <ScreenHeader.Back>
            <CloseButton onPress={dismiss} />
          </ScreenHeader.Back>
          <ScreenHeader.Title>{category?.name ?? t("goals.title")}</ScreenHeader.Title>
          <ScreenHeader.Actions>
            {/* Saving is per-target now — the header's action is adding. It
                stays put on empty lists: the empty state's CTA duplicates it
                rather than replacing the persistent anchor. */}
            <Button isIconOnly accessibilityLabel={t("goals.addGoal")} onPress={handleAdd}>
              <Plus size={22} color="white" />
            </Button>
          </ScreenHeader.Actions>
        </ScreenHeader>
      </ScreenHeader.Floating>
    </ScreenHeader.ScrollArea>
  );
}
