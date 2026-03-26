import { useTranslation } from "react-i18next";
import { View } from "react-native";
import Animated, { FadeOutLeft, LinearTransition } from "react-native-reanimated";
import { SectionHeader, SwipeableRow } from "@/ui/molecules";
import { LocalBudgetRow } from "./LocalBudgetRow";
import type { BudgetMetadata } from "@/services/budgetMetadata";

type LocalBudgetListProps = {
  budgets: BudgetMetadata[];
  selecting: string | null;
  onSelect: (meta: BudgetMetadata) => void;
  onDelete: (meta: BudgetMetadata) => void;
};

export function LocalBudgetList({ budgets, selecting, onSelect, onDelete }: LocalBudgetListProps) {
  const { t } = useTranslation("auth");

  return (
    <View className="gap-2">
      <SectionHeader title={t("onThisDevice")} />
      <Animated.View className="gap-1" layout={LinearTransition}>
        {budgets.map((meta) => (
          <Animated.View
            key={meta.id}
            exiting={FadeOutLeft.duration(200)}
            layout={LinearTransition}
          >
            <SwipeableRow onDelete={() => onDelete(meta)}>
              <LocalBudgetRow
                meta={meta}
                isSelecting={selecting === meta.id}
                onPress={() => onSelect(meta)}
                onDelete={() => onDelete(meta)}
              />
            </SwipeableRow>
          </Animated.View>
        ))}
      </Animated.View>
    </View>
  );
}
