import { Fragment } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { Button, ListGroup, Separator, Switch, Typography, useThemeColor } from "heroui-native";
import { EmptyState } from "heroui-native-pro";
import { Info, Target, TriangleAlert } from "lucide-react-native";
import {
  describeTemplate,
  NON_CONTRIBUTION_TYPES,
  translateDescription,
  type AutomationEntry,
  type AutomationErrorKind,
  type GlobalConflictKind,
} from "@/screens/budget/goals";
import type { Schedule } from "@/core/types/models";
import { GoalListRow } from "./GoalListRow";
import { displayTypeMeta } from "../displayTypeMeta";
import { conflictMessageKey, isSilentError } from "../messages";

/**
 * Two parallel sections, always both: the goals that budget money (a tappable
 * add-first-goal card when there are none — no floating hero, so the layout
 * holds its shape empty or full) and the category-wide limits & tracking
 * switches.
 */
export function GoalListPane({
  entries,
  schedules,
  errorsByEntry,
  conflicts,
  importedFromNotes,
  onOpenEntry,
  onAddGoal,
  onAddOption,
  onRemoveOption,
}: {
  entries: AutomationEntry[];
  schedules: Schedule[];
  errorsByEntry: Map<string, AutomationErrorKind>;
  conflicts: GlobalConflictKind[];
  importedFromNotes: boolean;
  onOpenEntry: (entryId: string) => void;
  /** Start a fresh goal — same flow as the header's ＋. */
  onAddGoal: () => void;
  /** Switch a cap/target on: create it and open its editor. */
  onAddOption: (type: "limit" | "goal") => void;
  /** Switch it off: remove it (persists at once). */
  onRemoveOption: (entryId: string) => void;
}) {
  const { t, i18n } = useTranslation("budget");
  const muted = useThemeColor("muted");
  const foreground = useThemeColor("foreground");
  const danger = useThemeColor("danger");

  const scheduleNameFor = (entry: AutomationEntry) => {
    if (entry.template.type !== "schedule") return undefined;
    const { scheduleId, name } = entry.template;
    const match = schedules.find((s) => (scheduleId ? s.id === scheduleId : s.name === name));
    return match?.name ?? undefined;
  };

  const goals = entries.filter((e) => !NON_CONTRIBUTION_TYPES.has(e.displayType));
  const capEntry = entries.find((e) => e.displayType === "limit");
  const targetEntry = entries.find((e) => e.displayType === "goal");
  // Externally-authored leftovers (an unfused refill) — still shown as rows.
  const strayOptions = entries.filter(
    (e) => NON_CONTRIBUTION_TYPES.has(e.displayType) && e !== capEntry && e !== targetEntry,
  );

  /**
   * A category-wide setting, switched like one: on creates it and opens its
   * editor, off removes it. The cap's switch disables without a contributing
   * goal — a ceiling with nothing under it budgets nothing, and the greyed
   * switch says so before the user trips on it.
   */
  const renderOptionSlot = (
    type: "limit" | "goal",
    entry: AutomationEntry | undefined,
    isDisabled = false,
  ) => {
    const meta = displayTypeMeta[type];
    const Icon = meta.icon;
    const error = entry ? errorsByEntry.get(entry.id) : undefined;
    const flagged = error != null && !isSilentError(error);
    const summary = entry
      ? translateDescription(describeTemplate(entry.template, i18n.language), t)
      : null;

    return (
      <ListGroup.Item
        disabled={isDisabled}
        onPress={entry ? () => onOpenEntry(entry.id) : () => onAddOption(type)}
      >
        <ListGroup.ItemPrefix>
          <View className="w-6 items-center justify-center">
            <Icon size={18} color={flagged ? danger : entry ? foreground : muted} />
          </View>
        </ListGroup.ItemPrefix>
        <ListGroup.ItemContent>
          <ListGroup.ItemTitle className={entry && !isDisabled ? undefined : "text-muted"}>
            {t(meta.labelKey)}
          </ListGroup.ItemTitle>
          {summary ? (
            <Typography className="text-sm text-muted" numberOfLines={2}>
              {summary}
            </Typography>
          ) : null}
        </ListGroup.ItemContent>
        <ListGroup.ItemSuffix>
          <Switch
            isSelected={entry != null}
            isDisabled={isDisabled}
            onSelectedChange={(on) => {
              if (on) onAddOption(type);
              else if (entry) onRemoveOption(entry.id);
            }}
          />
        </ListGroup.ItemSuffix>
      </ListGroup.Item>
    );
  };

  return (
    <View className="gap-6 px-4 pt-2 pb-8">
      {importedFromNotes ? (
        <View className="flex-row gap-2 rounded-xl bg-surface p-3">
          <Info size={18} color={muted} />
          <Typography className="flex-1 text-sm text-muted">
            {t("goals.importedFromNotes")}
          </Typography>
        </View>
      ) : null}

      {conflicts.map((conflict) => (
        <View key={conflict.kind} className="flex-row gap-2 rounded-xl bg-surface p-3">
          <TriangleAlert size={18} color={danger} />
          <Typography className="flex-1 text-sm text-danger">
            {t(conflictMessageKey(conflict), conflict as Record<string, unknown>)}
          </Typography>
        </View>
      ))}

      <View>
        <Typography className="mb-1 ml-2 text-xs font-semibold uppercase text-muted">
          {t("goals.sectionGoals")}
        </Typography>
        {goals.length > 0 || strayOptions.length > 0 ? (
          <ListGroup>
            {[...goals, ...strayOptions].map((entry, i) => (
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
        ) : (
          <EmptyState className="rounded-2xl border border-dashed border-border">
            <EmptyState.Header>
              <EmptyState.Media variant="icon">
                <Target size={20} color={muted} />
              </EmptyState.Media>
              <EmptyState.Title>{t("goals.emptyTitle")}</EmptyState.Title>
              <EmptyState.Description>{t("goals.emptyMessage")}</EmptyState.Description>
            </EmptyState.Header>
            <EmptyState.Content>
              <Button size="sm" onPress={onAddGoal}>
                {t("goals.addGoal")}
              </Button>
            </EmptyState.Content>
          </EmptyState>
        )}
      </View>

      {/* Category-level settings, apart from the goals that budget: the cap
          tops the whole category (disabled until a goal exists to top) and
          the target redefines its progress bar. */}
      <View>
        <Typography className="mb-1 ml-2 text-xs font-semibold uppercase text-muted">
          {t("goals.sectionTracking")}
        </Typography>
        <ListGroup>
          {renderOptionSlot("limit", capEntry, goals.length === 0 && capEntry == null)}
          <Separator className="mx-4" />
          {renderOptionSlot("goal", targetEntry)}
        </ListGroup>
      </View>
    </View>
  );
}
