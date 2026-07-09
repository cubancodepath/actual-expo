import { RefreshControl, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useTranslation } from "react-i18next";
import {
  CloseButton,
  LinkButton,
  ListGroup,
  ScrollShadow,
  Spinner,
  Typography,
  useThemeColor,
} from "heroui-native";
import { useBudgetContextStore } from "@/stores/budgetContextStore";
import { InlineError } from "@/ui/feedback/InlineError";
import { BudgetFileRow } from "@/ui/BudgetFileRow";
import { BudgetOpeningOverlay } from "@/screens/files/components/BudgetOpeningOverlay";
import { useBudgetFiles, fileKey } from "@/screens/files/hooks/useBudgetFiles";
import type { ReconciledBudgetFile } from "@/services/budgetfiles";

/** In-app budget switcher, presented as a full-screen modal. */
export function ChangeBudgetScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { t: ta } = useTranslation("auth");
  const accent = useThemeColor("accent");
  const { activeBudgetId } = useBudgetContextStore();
  const {
    localFiles,
    remoteFiles,
    loading,
    refreshing,
    listError,
    switching,
    selectFile,
    refresh,
    dismissError,
  } = useBudgetFiles();

  async function handleSelect(file: ReconciledBudgetFile) {
    if (file.localId && file.localId === activeBudgetId) {
      router.back();
      return;
    }
    const switched = await selectFile(file);
    if (switched) router.dismissAll();
  }

  const hasFiles = localFiles.length > 0 || remoteFiles.length > 0;
  const isSwitching = switching !== null;

  function renderSection(title: string, files: ReconciledBudgetFile[]) {
    return (
      <>
        <Typography
          type="body-xs"
          weight="semibold"
          color="muted"
          className="uppercase tracking-wide mt-6 mb-2 ml-1"
        >
          {title}
        </Typography>
        <ListGroup className="overflow-hidden">
          {files.map((file, index) => (
            <BudgetFileRow
              key={fileKey(file)}
              file={file}
              isActive={!isSwitching && file.localId === activeBudgetId}
              isSelecting={switching?.key === fileKey(file)}
              onPress={() => void handleSelect(file)}
              showSeparator={index < files.length - 1}
            />
          ))}
        </ListGroup>
      </>
    );
  }

  return (
    <View className="flex-1 bg-background">
      {/* Manual modal header (template pattern: CloseButton + centered title) */}
      <View
        className="flex-row items-center justify-between px-5 pb-3"
        style={{ paddingTop: insets.top + 8 }}
      >
        <CloseButton onPress={() => router.back()} />
        <Typography type="body" weight="semibold">
          {t("nav.switchBudget")}
        </Typography>
        <LinkButton size="sm" onPress={() => router.push("/(auth)/new-budget")}>
          <LinkButton.Label className="text-accent">{ta("new")}</LinkButton.Label>
        </LinkButton>
      </View>

      <ScrollShadow LinearGradientComponent={LinearGradient} size={40} className="flex-1">
        <ScrollView
          className="flex-1 px-6"
          contentContainerClassName="pb-16"
          scrollEnabled={!isSwitching}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={refresh}
              tintColor={accent}
              enabled={!isSwitching}
            />
          }
        >
          <View className="mt-3">
            <InlineError error={listError} onDismiss={dismissError} />
          </View>

          {loading ? (
            <View className="mt-4 items-center gap-3 rounded-2xl bg-surface py-8">
              <Spinner color={accent} />
              <Typography type="body-sm" color="muted">
                {t("loading")}
              </Typography>
            </View>
          ) : hasFiles ? (
            <>
              {localFiles.length > 0 && renderSection(ta("onThisDevice"), localFiles)}
              {remoteFiles.length > 0 && renderSection(ta("availableOnServer"), remoteFiles)}
            </>
          ) : (
            <View className="items-center gap-2 pt-24">
              <Typography type="body" weight="semibold">
                {ta("noBudgetsFound")}
              </Typography>
              <Typography type="body-sm" color="muted" className="text-center">
                {ta("noBudgetsDescription")}
              </Typography>
            </View>
          )}
        </ScrollView>
      </ScrollShadow>

      <BudgetOpeningOverlay
        visible={isSwitching}
        phase={switching?.phase ?? "opening"}
        budgetName={switching?.name ?? null}
      />
    </View>
  );
}
