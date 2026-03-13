import { Stack } from "expo-router";
import { useQuickActionRouting } from "expo-quick-actions/router";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../src/presentation/providers/ThemeProvider";
import {
  themedScreenOptions,
  themedModalOptions,
} from "../../src/presentation/navigation/screenOptions";

export default function AuthLayout() {
  useQuickActionRouting();
  const theme = useTheme();
  const screen = themedScreenOptions(theme);
  const modal = themedModalOptions(theme);
  const { t } = useTranslation();

  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false, title: "" }} />
      <Stack.Screen
        name="account/new"
        options={{ title: t('nav.newAccount'), ...modal }}
      />
      <Stack.Screen
        name="account/[id]"
        options={{ title: "", headerBackTitle: " ", ...screen }}
      />
      <Stack.Screen
        name="account/search"
        options={{
          ...screen,
          animation: "fade",
          animationDuration: 150,
          headerBackVisible: false,
          headerLeft: () => null,
        }}
      />
      <Stack.Screen
        name="account/reconcile"
        options={{ headerShown: false, ...modal }}
      />
      <Stack.Screen
        name="account/settings"
        options={{ title: t('nav.accountSettings'), ...modal }}
      />
      <Stack.Screen
        name="account/close"
        options={{
          ...screen,
          title: t('nav.closeAccount'),
          presentation: "formSheet",
          sheetAllowedDetents: [0.75, 1.0],
          contentStyle: { backgroundColor: theme.colors.pageBackground },
        }}
      />
      <Stack.Screen
        name="transaction"
        options={{ headerShown: false, ...modal }}
      />
      <Stack.Screen
        name="budget/assign"
        options={{ title: t('nav.assignBudget'), ...modal }}
      />
      <Stack.Screen name="budget/edit" options={{ headerShown: false }} />
      <Stack.Screen
        name="budget/reorder"
        options={{
          ...screen,
          title: t('nav.reorder'),
          presentation: "formSheet",
          sheetAllowedDetents: [1.0],
          contentStyle: { backgroundColor: theme.colors.pageBackground },
        }}
      />
      <Stack.Screen
        name="budget/new-group"
        options={{
          ...screen,
          title: t('nav.newGroup'),
          presentation: "formSheet",
          sheetAllowedDetents: "fitToContents",
          contentStyle: { backgroundColor: theme.colors.pageBackground },
        }}
      />
      <Stack.Screen
        name="budget/new-category"
        options={{
          ...screen,
          title: t('nav.newCategory'),
          presentation: "formSheet",
          sheetAllowedDetents: "fitToContents",
          contentStyle: { backgroundColor: theme.colors.pageBackground },
        }}
      />
      <Stack.Screen
        name="budget/rename-category"
        options={{
          ...screen,
          title: t('nav.renameCategory'),
          presentation: "formSheet",
          sheetAllowedDetents: "fitToContents",
          contentStyle: { backgroundColor: theme.colors.pageBackground },
        }}
      />
      <Stack.Screen
        name="budget/quick-edit-category"
        options={{
          ...screen,
          title: t('nav.editCategory'),
          presentation: "formSheet",
          sheetAllowedDetents: "fitToContents",
          contentStyle: { backgroundColor: theme.colors.pageBackground },
        }}
      />
      <Stack.Screen
        name="budget/edit-group"
        options={{
          ...screen,
          title: t('nav.editGroup'),
          presentation: "formSheet",
          sheetAllowedDetents: "fitToContents",
          contentStyle: { backgroundColor: theme.colors.pageBackground },
        }}
      />
      <Stack.Screen
        name="budget/edit-category"
        options={{
          headerShown: false,
          ...modal,
        }}
      />
      <Stack.Screen
        name="budget/goal"
        options={{
          ...screen,
          title: t('nav.goalTarget'),
          presentation: "formSheet",
          sheetAllowedDetents: [1.0],
          contentStyle: { backgroundColor: theme.colors.pageBackground },
        }}
      />
      <Stack.Screen
        name="budget/notes"
        options={{ title: t('nav.budgetMovements'), ...modal }}
      />
      <Stack.Screen
        name="budget/category-transactions"
        options={{ title: t('nav.transactions'), ...modal }}
      />
      <Stack.Screen
        name="budget/cover-overspent"
        options={{
          ...screen,
          title: t('nav.overspentCategories'),
          presentation: "formSheet",
          sheetAllowedDetents: "fitToContents",
          contentStyle: { backgroundColor: theme.colors.pageBackground },
        }}
      />
      <Stack.Screen
        name="budget/cover-source"
        options={{
          headerShown: false,
          presentation: "formSheet",
          sheetAllowedDetents: [1.0],
          contentStyle: { backgroundColor: theme.colors.pageBackground },
        }}
      />
      <Stack.Screen
        name="budget/cover-category-picker"
        options={{
          headerShown: false,
          presentation: "formSheet",
          sheetAllowedDetents: [0.5, 1.0],
          contentStyle: { backgroundColor: theme.colors.pageBackground },
        }}
      />
      <Stack.Screen
        name="budget/hold"
        options={{
          ...screen,
          title: t('nav.holdForNextMonth'),
          presentation: "formSheet",
          sheetAllowedDetents: [0.45],
          contentStyle: { backgroundColor: theme.colors.pageBackground },
        }}
      />
      <Stack.Screen
        name="budget/move-money"
        options={{
          headerShown: false,
          presentation: "formSheet",
          sheetAllowedDetents: [1.0],
          contentStyle: { backgroundColor: theme.colors.pageBackground },
        }}
      />
      <Stack.Screen
        name="budget/delete-category-picker"
        options={{
          headerShown: false,
          ...modal,
        }}
      />
      <Stack.Screen
        name="budget/move-category-picker"
        options={{
          headerShown: false,
          presentation: "formSheet",
          sheetAllowedDetents: [0.5, 1.0],
          contentStyle: { backgroundColor: theme.colors.pageBackground },
        }}
      />
      <Stack.Screen
        name="categories"
        options={{ title: t('nav.manageCategories'), ...modal }}
      />
      <Stack.Screen
        name="payees"
        options={{ title: t('nav.managePayees'), ...modal }}
      />
      <Stack.Screen
        name="schedules"
        options={{ title: t('nav.schedules'), ...modal }}
      />
      <Stack.Screen
        name="schedule"
        options={{ headerShown: false, ...modal }}
      />
      <Stack.Screen
        name="change-budget"
        options={{ title: t('nav.changeBudget'), ...modal }}
      />
      <Stack.Screen name="settings" options={{ headerShown: false, presentation: "fullScreenModal" }} />
      <Stack.Screen name="new-budget" options={{ headerShown: false }} />
    </Stack>
  );
}
