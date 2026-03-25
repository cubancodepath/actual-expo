import { RefreshControl, ScrollView, View } from "react-native";
import { useThemeColor } from "@/ui";
import { Alert } from "@/ui/molecules";
import {
  useBudgetPicker,
  BudgetPickerHeader,
  BudgetSectionList,
  BudgetEmptyState,
  BudgetLoadingState,
  BudgetOpeningOverlay,
} from "@/features/budget-picker";

export default function FilesScreen() {
  const picker = useBudgetPicker();
  const accentColor = useThemeColor("accent");

  return (
    <View className="flex-1 bg-background">
      <BudgetPickerHeader onLogout={picker.handleLogout} onNew={picker.handleNew} />

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

        {picker.loading && !picker.hasFiles ? (
          <BudgetLoadingState />
        ) : !picker.hasFiles ? (
          <BudgetEmptyState onCreateNew={picker.handleNew} />
        ) : (
          <BudgetSectionList
            localFiles={picker.localFiles}
            remoteFiles={picker.remoteFiles}
            hasDetached={picker.hasDetached}
            selecting={picker.selecting}
            actionInProgress={picker.actionInProgress}
            onSelect={picker.handleSelect}
            onDelete={picker.handleDelete}
            onUpload={picker.handleUpload}
            onActions={picker.showActions}
          />
        )}
      </ScrollView>

      {picker.overlay && (
        <BudgetOpeningOverlay phase={picker.overlay.phase} budgetName={picker.overlay.name} />
      )}
    </View>
  );
}
