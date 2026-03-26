import { RefreshControl, ScrollView, View } from "react-native";
import Animated, { FadeIn, FadeInDown, FadeOut } from "react-native-reanimated";
import { useThemeColor } from "@/ui";
import { Alert } from "@/ui/molecules";
import {
  useLocalBudgetPicker,
  LocalBudgetHeader,
  LocalBudgetList,
  BudgetEmptyState,
  BudgetLoadingState,
  BudgetOpeningOverlay,
} from "@/features/budget-picker";

export default function LocalSetupScreen() {
  const picker = useLocalBudgetPicker();
  const accentColor = useThemeColor("accent");

  return (
    <View className="flex-1 bg-background">
      <Animated.View entering={FadeInDown.duration(250).delay(50)}>
        <LocalBudgetHeader onBack={picker.handleBack} onNew={picker.handleNew} />
      </Animated.View>

      <ScrollView
        contentContainerClassName="px-6 pb-12"
        refreshControl={
          <RefreshControl
            refreshing={picker.refreshing}
            onRefresh={picker.refresh}
            tintColor={accentColor}
          />
        }
      >
        {picker.error && (
          <Alert
            variant="error"
            title={picker.error.message}
            onDismiss={picker.dismissError}
            className="mb-4"
          />
        )}

        {picker.loading ? (
          <BudgetLoadingState />
        ) : !picker.hasBudgets ? (
          <Animated.View entering={FadeIn.duration(200)}>
            <BudgetEmptyState onCreateNew={picker.handleNew} />
          </Animated.View>
        ) : (
          <Animated.View entering={FadeIn.duration(200)}>
            <LocalBudgetList
              budgets={picker.budgets}
              selecting={picker.selecting}
              onSelect={picker.handleSelect}
              onDelete={picker.handleDelete}
            />
          </Animated.View>
        )}
      </ScrollView>

      {picker.overlay && (
        <Animated.View
          entering={FadeIn.duration(200)}
          exiting={FadeOut.duration(150)}
          className="absolute inset-0"
        >
          <BudgetOpeningOverlay phase="opening" budgetName={picker.overlay.name} />
        </Animated.View>
      )}
    </View>
  );
}
