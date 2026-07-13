import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import Animated from "react-native-reanimated";
import { Accordion, AccordionLayoutTransition } from "heroui-native";
import { sheetForMonth } from "@/core/domain/spreadsheet/bindings";
import { useBudgetMonth } from "@/screens/budget/hooks/useBudgetMonth";
import { HIDDEN_GROUP_ID, useBudgetSections } from "@/screens/budget/hooks/useBudgetSections";
import { BudgetHeader } from "@/screens/budget/components/BudgetHeader";
import { BudgetListSkeleton } from "@/features/budget/components/BudgetListSkeleton";
import { AddTransactionFab } from "@/ui/AddTransactionFab";
import { BudgetGroup } from "./components/BudgetGroup";

export function BudgetScreen() {
  const { month } = useBudgetMonth();
  const sheet = sheetForMonth(month);
  const { sections, isLoading } = useBudgetSections();

  // Controlled expansion: seed once (all groups expanded except hidden) the
  // first time sections arrive; after that the user drives it.
  const [expandedIds, setExpandedIds] = useState<string[] | null>(null);
  useEffect(() => {
    if (expandedIds === null && sections.length > 0) {
      setExpandedIds(sections.filter((s) => s.id !== HIDDEN_GROUP_ID).map((s) => s.id));
    }
  }, [sections, expandedIds]);

  const handleValueChange = useCallback((v: string | string[] | undefined) => {
    setExpandedIds(Array.isArray(v) ? v : v ? [v] : []);
  }, []);

  const dataReady = !isLoading || sections.length > 0;

  return (
    <View className="flex-1 bg-background">
      <BudgetHeader />

      {/* TODO: ready-to-assign / uncategorized / overspent summary (next step) */}

      {!dataReady ? (
        <BudgetListSkeleton />
      ) : (
        <Animated.ScrollView
          layout={AccordionLayoutTransition}
          contentContainerStyle={{ paddingBottom: 140 }}
          showsVerticalScrollIndicator={false}
        >
          <Accordion
            selectionMode="multiple"
            hideSeparator
            value={expandedIds ?? []}
            onValueChange={handleValueChange}
          >
            {sections.map((group) => (
              <BudgetGroup key={group.id} group={group} sheet={sheet} />
            ))}
          </Accordion>
        </Animated.ScrollView>
      )}

      <AddTransactionFab />
    </View>
  );
}
