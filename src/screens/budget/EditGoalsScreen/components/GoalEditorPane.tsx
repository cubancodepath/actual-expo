import { useState } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { Button, Typography, useThemeColor } from "heroui-native";
import { ArrowDown, ArrowUp, TriangleAlert } from "lucide-react-native";
import { amountCentsOf } from "@/core/domain/goals";
import type {
  AutomationEntry,
  AutomationErrorKind,
  DisplayTemplateType,
  FixedTemplate,
} from "@/core/domain/goals";
import type {
  AverageTemplate,
  CopyTemplate,
  LimitTemplate,
  PercentageTemplate,
  RemainderTemplate,
  ScheduleTemplate,
  Template,
} from "@/core/domain/goals/types";
import type { Schedule } from "@/core/domain/schedules/types";
import { AmountKeyboard, useAmountKeyboardState } from "@/ui/amount-keyboard";
import { AmountHero } from "./fields/AmountHero";
import { FixedEditor } from "./editors/FixedEditor";
import { HistoricalEditor } from "./editors/HistoricalEditor";
import { InfoEditor } from "./editors/InfoEditor";
import { LimitEditor } from "./editors/LimitEditor";
import { PercentageEditor } from "./editors/PercentageEditor";
import { RemainderEditor } from "./editors/RemainderEditor";
import { ScheduleEditor } from "./editors/ScheduleEditor";
import { GoalTypePickerSheet } from "./GoalTypePickerSheet";
import { errorMessageKey, isSilentError } from "../messages";

/** i18n key for the label above the amount headline. */
function amountLabelKey(displayType: DisplayTemplateType) {
  switch (displayType) {
    case "limit":
      return "goals.fields.capAmount" as const;
    case "goal":
      return "goals.fields.targetBalance" as const;
    default:
      return "goals.fields.amount" as const;
  }
}

/**
 * Editor for one automation: its amount, its type-specific fields, and the
 * actions to retype or remove it. Nothing is written here — edits flow up to
 * the screen's draft and land on save.
 */
export function GoalEditorPane({
  entry,
  schedules,
  usedTypes,
  error,
  canMoveUp,
  canMoveDown,
  onChange,
  onChangeType,
  onMove,
  onOpenModePane,
}: {
  entry: AutomationEntry;
  schedules: Schedule[];
  usedTypes: ReadonlySet<DisplayTemplateType>;
  error?: AutomationErrorKind;
  /** Whether this goal has somewhere to move — false at the ends of the list. */
  canMoveUp: boolean;
  canMoveDown: boolean;
  onChange: (template: Template) => void;
  onChangeType: (displayType: DisplayTemplateType) => void;
  onMove: (direction: -1 | 1) => void;
  /** Open the fixed editor's "Next time I want to…" pane; `custom` = editor on Custom. */
  onOpenModePane: (custom: boolean) => void;
}) {
  const { t } = useTranslation("budget");
  const danger = useThemeColor("danger");
  const foreground = useThemeColor("foreground");
  const [typePickerOpen, setTypePickerOpen] = useState(false);

  // The AmountKeyboard provider lives in GoalEditorScreen (the floating
  // button rides on top of the pad, so the screen owns the open state);
  // this pane only composes its Trigger/DismissArea parts.
  const { isOpen: amountEditing } = useAmountKeyboardState();

  const { template, displayType } = entry;
  const cents = amountCentsOf(template);

  // The fixed editor owns its amount as one of its card rows; every other
  // editor keeps the big amount headline above its fields.
  const showHero = displayType !== "fixed" && cents != null;

  const renderFields = () => {
    switch (displayType) {
      case "fixed":
        return (
          <FixedEditor
            template={template as FixedTemplate}
            onChange={onChange}
            onOpenModePane={onOpenModePane}
          />
        );
      case "schedule":
        return (
          <ScheduleEditor
            template={template as ScheduleTemplate}
            schedules={schedules}
            onChange={onChange}
          />
        );
      case "percentage":
        return <PercentageEditor template={template as PercentageTemplate} onChange={onChange} />;
      case "historical":
        return (
          <HistoricalEditor
            template={template as AverageTemplate | CopyTemplate}
            onChange={onChange}
          />
        );
      case "limit":
        return <LimitEditor template={template as LimitTemplate} onChange={onChange} />;
      case "remainder":
        return <RemainderEditor template={template as RemainderTemplate} onChange={onChange} />;
      case "refill":
        return <InfoEditor message={t("goals.descriptions.refill")} />;
      case "goal":
        return <InfoEditor message={t("goals.descriptions.goal")} />;
    }
  };

  // Suppress a type's own row in the "already added" check — retyping to what
  // it already is must stay available.
  const otherTypes = new Set(usedTypes);

  return (
    <>
      <View className="px-4 pb-8">
        {showHero ? (
          <AmountKeyboard.Trigger>
            <AmountHero
              value={cents}
              label={t(amountLabelKey(displayType))}
              isEditing={amountEditing}
            />
          </AmountKeyboard.Trigger>
        ) : null}

        <AmountKeyboard.DismissArea>
          {renderFields()}

          {error && !isSilentError(error) ? (
            <View className="mt-3 flex-row gap-2 rounded-xl bg-surface p-3">
              <TriangleAlert size={18} color={danger} />
              <Typography className="flex-1 text-sm text-danger">
                {t(errorMessageKey(error), error as Record<string, unknown>)}
              </Typography>
            </View>
          ) : null}

          {/* Only worth showing when the goal shares the pot with others —
              order is the order they get funded in. */}
          {canMoveUp || canMoveDown ? (
            <View className="mt-4 flex-row gap-2">
              <Button
                variant="secondary"
                className="flex-1"
                isDisabled={!canMoveUp}
                onPress={() => onMove(-1)}
              >
                <ArrowUp size={16} color={foreground} />
                <Button.Label>{t("goals.fundEarlier")}</Button.Label>
              </Button>
              <Button
                variant="secondary"
                className="flex-1"
                isDisabled={!canMoveDown}
                onPress={() => onMove(1)}
              >
                <ArrowDown size={16} color={foreground} />
                <Button.Label>{t("goals.fundLater")}</Button.Label>
              </Button>
            </View>
          ) : null}

          <Button variant="secondary" className="mt-2" onPress={() => setTypePickerOpen(true)}>
            <Button.Label>{t("goals.changeType")}</Button.Label>
          </Button>
        </AmountKeyboard.DismissArea>
      </View>

      <GoalTypePickerSheet
        isOpen={typePickerOpen}
        onOpenChange={setTypePickerOpen}
        usedTypes={otherTypes}
        selectedType={displayType}
        onSelect={onChangeType}
      />
    </>
  );
}
