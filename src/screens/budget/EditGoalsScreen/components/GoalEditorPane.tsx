import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { Typography, useThemeColor } from "heroui-native";
import { TriangleAlert } from "lucide-react-native";
import type {
  AutomationErrorKind,
  DisplayTemplateType,
  GlobalConflictKind,
} from "@/core/domain/goals";
import type { GoalTemplate, LimitTemplate, Template } from "@/core/domain/goals/types";
import type { Schedule } from "@/core/domain/schedules/types";
import { AmountKeyboard } from "@/ui/amount-keyboard";
import { BalanceTargetEditor } from "./editors/BalanceTargetEditor";
import { GoalEditor } from "./editors/GoalEditor";
import { InfoEditor } from "./editors/InfoEditor";
import { LimitEditor } from "./editors/LimitEditor";
import { conflictMessageKey, errorMessageKey, isSilentError } from "../messages";

/**
 * Editor for one automation. Everything that budgets money goes through the
 * one GoalEditor (presets + Custom with its amount sources); the two options
 * (cap, balance target) keep their small dedicated editors. Nothing is
 * written here — edits flow up to the session's form and land on save.
 *
 * Conflicts render here too: a draft can trip a category-wide rule (say,
 * percentages over 100%) before it's anywhere the list could flag it, and a
 * disabled save button with no message would be a riddle.
 */
export function GoalEditorPane({
  template,
  displayType,
  schedules,
  error,
  conflicts = [],
  onChange,
  onChangeType,
  onOpenModePane,
}: {
  template: Template;
  displayType: DisplayTemplateType;
  schedules: Schedule[];
  error?: AutomationErrorKind;
  conflicts?: GlobalConflictKind[];
  onChange: (template: Template) => void;
  /** Swap the amount's source (the Custom "Based on" row). */
  onChangeType: (displayType: DisplayTemplateType) => void;
  /** Open the "Next time I want to…" pane; `custom` = editor on Custom. */
  onOpenModePane: (custom: boolean) => void;
}) {
  const { t } = useTranslation("budget");
  const danger = useThemeColor("danger");

  const renderFields = () => {
    switch (displayType) {
      case "limit":
        return <LimitEditor template={template as LimitTemplate} onChange={onChange} />;
      case "refill":
        return <InfoEditor message={t("goals.descriptions.refill")} />;
      case "goal":
        return <BalanceTargetEditor template={template as GoalTemplate} />;
      default:
        return (
          <GoalEditor
            template={template}
            displayType={displayType}
            schedules={schedules}
            onChange={onChange}
            onChangeType={onChangeType}
            onOpenModePane={onOpenModePane}
          />
        );
    }
  };

  const messages: { key: string; text: string }[] = [];
  if (error && !isSilentError(error)) {
    messages.push({
      key: `error-${error.kind}`,
      text: t(errorMessageKey(error), error as Record<string, unknown>),
    });
  }
  for (const conflict of conflicts) {
    messages.push({
      key: `conflict-${conflict.kind}`,
      text: t(conflictMessageKey(conflict), conflict as Record<string, unknown>),
    });
  }

  return (
    <View className="px-4 pb-8">
      <AmountKeyboard.DismissArea>
        {renderFields()}

        {messages.map(({ key, text }) => (
          <View key={key} className="mt-3 flex-row gap-2 rounded-xl bg-surface p-3">
            <TriangleAlert size={18} color={danger} />
            <Typography className="flex-1 text-sm text-danger">{text}</Typography>
          </View>
        ))}
      </AmountKeyboard.DismissArea>
    </View>
  );
}
