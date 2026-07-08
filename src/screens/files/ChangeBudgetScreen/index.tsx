import { useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { CloseButton, LinkButton, Spinner, Typography, useThemeColor } from "heroui-native";
import { useBudgetContextStore } from "@/stores/budgetContextStore";
import { InlineError } from "@/ui/feedback/InlineError";
import { BudgetFileRow } from "@/ui/BudgetFileRow";
import { BudgetOpeningOverlay } from "@/screens/files/components/BudgetOpeningOverlay";
import { useBudgetFiles, fileKey } from "@/screens/files/hooks/useBudgetFiles";
import type { ReconciledBudgetFile } from "@/services/budgetfiles";

type SwitchPhase = "downloading" | "opening" | null;

/** In-app budget switcher, presented as a full-screen modal. */
export function ChangeBudgetScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { t: ta } = useTranslation("auth");
  const accent = useThemeColor("accent");
  const { activeBudgetId } = useBudgetContextStore();
  const [switchingName, setSwitchingName] = useState<string | null>(null);
  const [switchPhase, setSwitchPhase] = useState<SwitchPhase>(null);
  const {
    localFiles,
    remoteFiles,
    loading,
    refreshing,
    listError,
    selecting,
    selectFile,
    refresh,
    dismissError,
  } = useBudgetFiles();

  async function handleSelect(file: ReconciledBudgetFile) {
    if (file.localId && file.localId === activeBudgetId) {
      router.back();
      return;
    }
    setSwitchingName(file.name);
    setSwitchPhase(file.state === "remote" ? "downloading" : "opening");
    try {
      await selectFile(file);
      router.dismissAll();
    } catch {
      setSwitchingName(null);
      setSwitchPhase(null);
    }
  }

  const hasFiles = localFiles.length > 0 || remoteFiles.length > 0;
  const isSwitching = selecting !== null;

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
            {localFiles.length > 0 && (
              <>
                <Typography
                  type="body-xs"
                  weight="semibold"
                  color="muted"
                  className="uppercase tracking-wide mt-6 mb-2 ml-1"
                >
                  {ta("onThisDevice")}
                </Typography>
                <View className="overflow-hidden rounded-2xl bg-surface">
                  {localFiles.map((file, index) => (
                    <BudgetFileRow
                      key={fileKey(file)}
                      file={file}
                      isActive={!isSwitching && file.localId === activeBudgetId}
                      isSelecting={false}
                      onPress={() => handleSelect(file)}
                      showSeparator={index < localFiles.length - 1}
                    />
                  ))}
                </View>
              </>
            )}

            {remoteFiles.length > 0 && (
              <>
                <Typography
                  type="body-xs"
                  weight="semibold"
                  color="muted"
                  className="uppercase tracking-wide mt-6 mb-2 ml-1"
                >
                  {ta("availableOnServer")}
                </Typography>
                <View className="overflow-hidden rounded-2xl bg-surface">
                  {remoteFiles.map((file, index) => (
                    <BudgetFileRow
                      key={fileKey(file)}
                      file={file}
                      isSelecting={false}
                      onPress={() => handleSelect(file)}
                      showSeparator={index < remoteFiles.length - 1}
                    />
                  ))}
                </View>
              </>
            )}
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

      <BudgetOpeningOverlay
        visible={isSwitching}
        phase={switchPhase ?? "opening"}
        budgetName={switchingName}
      />
    </View>
  );
}
