import { useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { withUniwind } from "uniwind";
import { LinearGradient } from "expo-linear-gradient";
import { useTranslation } from "react-i18next";
import {
  Alert as HeroAlert,
  Button,
  LinkButton,
  ListGroup,
  ScrollShadow,
  Spinner,
  Typography,
  useThemeColor,
  PressableFeedback,
} from "heroui-native";
import { logout } from "@/services/authService";
import { resetAllStores } from "@/stores/resetStores";
import { resetSyncState, clearSwitchingFlag } from "@/core/sync";
import { InlineError } from "@/ui/feedback/InlineError";
import { ConfirmDialog, type ConfirmRequest } from "@/ui/feedback/ConfirmDialog";
import { BudgetFileRow } from "@/ui/BudgetFileRow";
import { BudgetOpeningOverlay } from "@/screens/files/components/BudgetOpeningOverlay";
import { FileActionsSheet, type FileAction } from "@/screens/files/components/FileActionsSheet";
import { useBudgetFiles, fileKey } from "@/screens/files/hooks/useBudgetFiles";
import { buildActionRequest } from "./confirmRequests";
import type { ReconciledBudgetFile } from "@/services/budgetfiles";

const StyledIonicons = withUniwind(Ionicons);

/** Post-login landing screen: pick, manage or create a budget file. */
export function BudgetFilesScreen() {
  const router = useRouter();
  const { t } = useTranslation("auth");
  const { t: tc } = useTranslation("common");
  const [background, foreground, accent] = useThemeColor(["background", "foreground", "accent"]);
  const {
    localFiles,
    remoteFiles,
    loading,
    refreshing,
    listError,
    switching,
    actionInProgress,
    selectFile,
    deleteFile,
    uploadFile,
    convertToLocal,
    reRegister,
    refresh,
    dismissError,
  } = useBudgetFiles();

  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const [actionsFile, setActionsFile] = useState<ReconciledBudgetFile | null>(null);

  const translators = { t, tc };
  const actions = { deleteFile, uploadFile, convertToLocal, reRegister };

  const hasDetached = localFiles.some((f) => f.state === "detached");
  const hasFiles = localFiles.length > 0 || remoteFiles.length > 0;

  function handleFileAction(action: FileAction, file: ReconciledBudgetFile) {
    if (action === "download") {
      void selectFile(file);
      return;
    }
    setConfirm(buildActionRequest(action, file, translators, actions));
  }

  function handleLogout() {
    setConfirm({
      title: t("logOut"),
      description: t("logOutMessage"),
      actions: [
        {
          label: t("logOut"),
          isDestructive: true,
          onPress: () => {
            void (async () => {
              resetSyncState();
              resetAllStores();
              await logout();
              clearSwitchingFlag();
              router.replace("/");
            })();
          },
        },
      ],
    });
  }

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
              isSelecting={switching?.key === fileKey(file)}
              isActionInProgress={actionInProgress === fileKey(file)}
              onPress={() => void selectFile(file)}
              onLongPress={() => setActionsFile(file)}
              showSeparator={index < files.length - 1}
            />
          ))}
        </ListGroup>
      </>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: t("openBudget"),
          headerStyle: { backgroundColor: background },
          headerShadowVisible: false,
          headerTintColor: foreground,
          headerLeft: () => (
            <LinkButton size="sm" onPress={handleLogout}>
              <LinkButton.Label className="text-muted">{t("logOut")}</LinkButton.Label>
            </LinkButton>
          ),
          headerRight: () => (
            <LinkButton size="sm" onPress={() => router.push("/(files)/new-budget")}>
              <LinkButton.Label className="text-accent">{t("new")}</LinkButton.Label>
            </LinkButton>
          ),
        }}
      />

      <ScrollShadow LinearGradientComponent={LinearGradient} size={40} className="flex-1">
        <ScrollView
          className="flex-1 px-6"
          contentContainerClassName="pb-16"
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={accent} />
          }
        >
          <View className="mt-3">
            <InlineError error={listError} onDismiss={dismissError} />
          </View>

          {loading ? (
            <View className="mt-4 items-center gap-3 rounded-2xl bg-surface py-8">
              <Spinner color={accent} />
              <Typography type="body-sm" color="muted">
                {tc("loading")}
              </Typography>
            </View>
          ) : hasFiles ? (
            <>
              {localFiles.length > 0 && (
                <>
                  {hasDetached && (
                    <View className="mt-6">
                      <HeroAlert status="warning">
                        <HeroAlert.Indicator />
                        <HeroAlert.Content>
                          <HeroAlert.Description>{t("detachedHint")}</HeroAlert.Description>
                        </HeroAlert.Content>
                      </HeroAlert>
                    </View>
                  )}
                  {renderSection(t("onThisDevice"), localFiles)}
                </>
              )}
              {remoteFiles.length > 0 && renderSection(t("availableOnServer"), remoteFiles)}
            </>
          ) : (
            <View className="items-center gap-2 pt-24">
              <StyledIonicons name="folder-open-outline" size={48} className="text-muted" />
              <Typography type="body" weight="semibold">
                {t("noBudgetsFound")}
              </Typography>
              <Typography type="body-sm" color="muted" className="text-center">
                {t("noBudgetsDescription")}
              </Typography>
              <Button
                variant="primary"
                className="mt-4"
                onPress={() => router.push("/(files)/new-budget")}
              >
                <Button.Label>{t("createNewBudget")}</Button.Label>
              </Button>
            </View>
          )}
        </ScrollView>
      </ScrollShadow>

      <FileActionsSheet
        file={actionsFile}
        onClose={() => setActionsFile(null)}
        onAction={handleFileAction}
      />
      <ConfirmDialog request={confirm} onClose={() => setConfirm(null)} />

      <BudgetOpeningOverlay
        visible={switching !== null}
        phase={switching?.phase ?? "opening"}
        budgetName={switching?.name ?? null}
      />
    </View>
  );
}
