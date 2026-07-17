import { useEffect } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { ScreenHeader } from "@/ui/ScreenHeader";
import type { FixedTemplate } from "@/core/domain/goals";
import { FixedModePane } from "./components/FixedModePane";
import { useGoalAutomationsContext } from "./context/GoalAutomationsProvider";

/**
 * "Next time I want to…" — the fixed goal's mode, as its own pushed screen so
 * the choice reads like a page of the flow, not a popover.
 */
export function GoalModeScreen() {
  const { t } = useTranslation("budget");
  const router = useRouter();
  const { entryId, custom } = useLocalSearchParams<{ entryId: string; custom?: string }>();
  const { entries, updateEntry } = useGoalAutomationsContext();

  const entry = entries.find((e) => e.id === entryId);

  useEffect(() => {
    if (!entry) router.back();
  }, [entry, router]);

  if (!entry) return null;

  return (
    <ScreenHeader.ScrollArea>
      <ScreenHeader.Body contentContainerStyle={{ paddingBottom: 40 }}>
        <FixedModePane
          template={entry.template as FixedTemplate}
          preferCustom={custom === "1"}
          onChange={(template) => updateEntry(entry.id, template)}
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
