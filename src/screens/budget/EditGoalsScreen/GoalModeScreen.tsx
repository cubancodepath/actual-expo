import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useStore } from "@tanstack/react-form";
import { ScreenHeader } from "@/ui/ScreenHeader";
import type { FixedTemplate } from "@/core/server/budget/goals";
import { FixedModePane } from "./components/FixedModePane";
import { useGoalAutomationsContext } from "./context/GoalAutomationsProvider";

/**
 * "Next time I want to…" — the fixed goal's mode, as its own pushed screen so
 * the choice reads like a page of the flow, not a popover. Edits the same
 * form the editor holds.
 */
export function GoalModeScreen() {
  const { t } = useTranslation("budget");
  const router = useRouter();
  const { custom } = useLocalSearchParams<{ custom?: string }>();
  const { form } = useGoalAutomationsContext();

  const template = useStore(form.store, (s) => s.values.template);

  return (
    <ScreenHeader.ScrollArea>
      <ScreenHeader.Body contentContainerStyle={{ paddingBottom: 40 }}>
        <FixedModePane
          template={template as FixedTemplate}
          preferCustom={custom === "1"}
          onChange={(next) => form.setFieldValue("template", next)}
          onDone={() => router.back()}
        />
      </ScreenHeader.Body>

      <ScreenHeader.Floating>
        <ScreenHeader>
          <ScreenHeader.Back onPress={() => router.back()} />
          <ScreenHeader.Title>{t("goals.fixed.nextTimeTitle")}</ScreenHeader.Title>
        </ScreenHeader>
      </ScreenHeader.Floating>
    </ScreenHeader.ScrollArea>
  );
}
