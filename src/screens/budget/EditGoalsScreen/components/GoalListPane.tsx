import { Fragment } from "react";
import { Alert, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Button, ListGroup, Separator, Typography, useThemeColor } from "heroui-native";
import { Info, Plus, Target, TriangleAlert } from "lucide-react-native";
import {
  NON_CONTRIBUTION_TYPES,
  type AutomationEntry,
  type AutomationErrorKind,
  type GlobalConflictKind,
} from "@/core/domain/goals";
import type { Schedule } from "@/core/domain/schedules/types";
import { GoalListRow } from "./GoalListRow";
import { conflictMessageKey } from "../messages";

/**
 * The category's automations. Contributing goals come first, in the order the
 * engine funds them, then the options that cap or observe those goals.
 */
export function GoalListPane({
  entries,
  schedules,
  errorsByEntry,
  conflicts,
  importedFromNotes,
  isSaving,
  onOpenEntry,
  onAddGoal,
  onRemoveAll,
}: {
  entries: AutomationEntry[];
  schedules: Schedule[];
  errorsByEntry: Map<string, AutomationErrorKind>;
  conflicts: GlobalConflictKind[];
  importedFromNotes: boolean;
  isSaving: boolean;
  onOpenEntry: (entryId: string) => void;
  /** Create a goal and open its editor — no type question, Fixed is the default. */
  onAddGoal: () => void;
  onRemoveAll: () => void;
}) {
  const { t } = useTranslation("budget");
  const muted = useThemeColor("muted");
  const danger = useThemeColor("danger");
  const foreground = useThemeColor("foreground");

  const scheduleNameFor = (entry: AutomationEntry) => {
    if (entry.template.type !== "schedule") return undefined;
    const { scheduleId, name } = entry.template;
    const match = schedules.find((s) => (scheduleId ? s.id === scheduleId : s.name === name));
    return match?.name ?? undefined;
  };

  const goals = entries.filter((e) => !NON_CONTRIBUTION_TYPES.has(e.displayType));
  const options = entries.filter((e) => NON_CONTRIBUTION_TYPES.has(e.displayType));

  const confirmRemoveAll = () =>
    Alert.alert(t("goals.removeAllTitle"), t("goals.removeAllMessage"), [
      { text: t("goals.cancel"), style: "cancel" },
      { text: t("goals.removeAllConfirm"), style: "destructive", onPress: onRemoveAll },
    ]);

  const renderRows = (list: AutomationEntry[]) => (
    <ListGroup>
      {list.map((entry, i) => (
        <Fragment key={entry.id}>
          {i > 0 ? <Separator className="mx-4" /> : null}
          <GoalListRow
            entry={entry}
            error={errorsByEntry.get(entry.id)}
            scheduleName={scheduleNameFor(entry)}
            onPress={() => onOpenEntry(entry.id)}
          />
        </Fragment>
      ))}
    </ListGroup>
  );

  return (
    <View className="px-4 pb-8">
      {importedFromNotes ? (
        <View className="mb-3 flex-row gap-2 rounded-xl bg-surface p-3">
          <Info size={18} color={muted} />
          <Typography className="flex-1 text-sm text-muted">
            {t("goals.importedFromNotes")}
          </Typography>
        </View>
      ) : null}

      {conflicts.map((conflict) => (
        <View key={conflict.kind} className="mb-3 flex-row gap-2 rounded-xl bg-surface p-3">
          <TriangleAlert size={18} color={danger} />
          <Typography className="flex-1 text-sm text-danger">
            {t(conflictMessageKey(conflict), conflict as Record<string, unknown>)}
          </Typography>
        </View>
      ))}

      {entries.length === 0 ? (
        <View className="items-center gap-2 px-6 py-10">
          <Target size={40} color={muted} />
          <Typography className="text-center text-lg font-semibold text-foreground">
            {t("goals.emptyTitle")}
          </Typography>
          <Typography className="text-center text-sm text-muted">
            {t("goals.emptyMessage")}
          </Typography>
        </View>
      ) : null}

      {goals.length > 0 ? (
        <View className="mb-3">
          <Typography className="mb-1 ml-2 text-xs font-semibold uppercase text-muted">
            {t("goals.sectionGoals")}
          </Typography>
          {renderRows(goals)}
          {goals.length > 1 ? (
            <Typography className="mt-1 ml-2 text-xs text-muted">
              {t("goals.priorityHint")}
            </Typography>
          ) : null}
        </View>
      ) : null}

      {options.length > 0 ? (
        <View className="mb-3">
          <Typography className="mb-1 ml-2 text-xs font-semibold uppercase text-muted">
            {t("goals.sectionOptions")}
          </Typography>
          {renderRows(options)}
        </View>
      ) : null}

      <Button variant="secondary" onPress={onAddGoal}>
        <Plus size={18} color={foreground} />
        <Button.Label>{t("goals.addGoal")}</Button.Label>
      </Button>

      {entries.length > 0 ? (
        <Button variant="ghost" className="mt-2" isDisabled={isSaving} onPress={confirmRemoveAll}>
          <Button.Label className="text-danger">{t("goals.removeAll")}</Button.Label>
        </Button>
      ) : null}
    </View>
  );
}
