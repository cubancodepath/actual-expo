import { RefreshControl, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { LinkButton, ListGroup, Spinner, Typography, useThemeColor } from "heroui-native";
import { useBudgetContextStore } from "@/stores/budgetContextStore";
import { ScreenHeader } from "@/ui/ScreenHeader";
import { CloseButton } from "@/ui/CloseButton";
import { InlineError } from "@/ui/feedback/InlineError";
import { BudgetFileRow } from "@/ui/BudgetFileRow";
import { LoadingOverlay } from "@/ui/LoadingOverlay";
import { useBudgetFiles, fileKey } from "@/screens/files/hooks/useBudgetFiles";
import type { ReconciledBudgetFile } from "@/core/server/budgetfiles/app";

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
    <View className="flex-1">
      <ScreenHeader.ScrollArea>
        <ScreenHeader.Body
          contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: insets.bottom + 64 }}
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
        </ScreenHeader.Body>

        <ScreenHeader.Floating>
          <View style={{ height: insets.top }} />
          <ScreenHeader>
            <ScreenHeader.Back>
              <CloseButton onPress={() => router.back()} />
            </ScreenHeader.Back>
            <ScreenHeader.Title>{t("nav.switchBudget")}</ScreenHeader.Title>
            <ScreenHeader.Actions>
              <LinkButton size="sm" onPress={() => router.push("/(auth)/new-budget")}>
                <LinkButton.Label className="text-accent">{ta("new")}</LinkButton.Label>
              </LinkButton>
            </ScreenHeader.Actions>
          </ScreenHeader>
        </ScreenHeader.Floating>
      </ScreenHeader.ScrollArea>

      <LoadingOverlay visible={isSwitching} />
    </View>
  );
}
