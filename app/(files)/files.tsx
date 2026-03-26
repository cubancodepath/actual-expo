import { RefreshControl, ScrollView, View } from "react-native";
import Animated, { FadeIn, FadeInDown, FadeOut } from "react-native-reanimated";
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
      <Animated.View entering={FadeInDown.duration(250).delay(50)}>
        <BudgetPickerHeader onLogout={picker.handleLogout} onNew={picker.handleNew} />
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

        {picker.loading && !picker.hasFiles ? (
          <BudgetLoadingState />
        ) : !picker.hasFiles ? (
          <Animated.View entering={FadeIn.duration(200)}>
            <BudgetEmptyState onCreateNew={picker.handleNew} />
          </Animated.View>
        ) : (
          <Animated.View entering={FadeIn.duration(200)}>
            <BudgetSectionList
              localFiles={picker.localFiles}
              remoteFiles={picker.remoteFiles}
              hasDetached={picker.hasDetached}
              selecting={picker.selecting}
              actionInProgress={picker.actionInProgress}
              onSelect={picker.handleSelect}
              onDelete={picker.deleteFile}
              onUpload={picker.uploadFile}
              onDownload={picker.handleSelect}
              onConvertToLocal={picker.convertToLocal}
              onReRegister={picker.reRegister}
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
          <BudgetOpeningOverlay phase={picker.overlay.phase} budgetName={picker.overlay.name} />
        </Animated.View>
      )}
    </View>
  );
}
