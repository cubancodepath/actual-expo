import { KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Alert } from "@/ui/molecules";
import {
  useBudgetSetup,
  BudgetSetupHero,
  BudgetSetupForm,
  BudgetSetupActions,
} from "@/features/budget-setup";

export default function NewBudgetScreen() {
  const setup = useBudgetSetup("server");

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-background"
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerClassName="flex-grow px-6 pt-safe-offset-4 pb-6"
        keyboardShouldPersistTaps="handled"
      >
        <BudgetSetupHero />

        {setup.error && (
          <Animated.View entering={FadeInDown.duration(200)}>
            <Alert
              variant="error"
              title={setup.error.message}
              onDismiss={setup.dismissError}
              className="mb-4"
            />
          </Animated.View>
        )}

        <BudgetSetupForm
          budgetName={setup.budgetName}
          onBudgetNameChange={setup.setBudgetName}
          accountName={setup.accountName}
          onAccountNameChange={setup.setAccountName}
          balance={setup.balance}
          onBalanceChange={setup.setBalance}
        />

        <BudgetSetupActions
          canCreate={setup.canCreate}
          loading={setup.loading}
          onCreate={setup.create}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
