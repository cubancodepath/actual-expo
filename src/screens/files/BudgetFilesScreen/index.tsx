import { useState } from "react";
import { RefreshControl, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { withUniwind } from "uniwind";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import {
  Alert as HeroAlert,
  Button,
  LinkButton,
  ListGroup,
  Spinner,
  Typography,
  useThemeColor,
} from "heroui-native";
import { useSessionStore } from "@/stores/sessionStore";
import { resetAllStores } from "@/stores/resetStores";
import { resetSyncState, clearSwitchingFlag } from "@/core/sync";
import { ScreenHeader } from "@/ui/ScreenHeader";
import { InlineError } from "@/ui/feedback/InlineError";
import { ConfirmDialog, type ConfirmRequest } from "@/ui/feedback/ConfirmDialog";
import { BudgetFileRow } from "@/ui/BudgetFileRow";
import { LoadingOverlay } from "@/ui/LoadingOverlay";
import { FileActionsSheet, type FileAction } from "@/screens/files/components/FileActionsSheet";
import { useBudgetFiles, fileKey } from "@/screens/files/hooks/useBudgetFiles";
import { buildActionRequest } from "./confirmRequests";
import type { ReconciledBudgetFile } from "@/core/server/budgetfiles/app";

const StyledIonicons = withUniwind(Ionicons);

/** Post-login landing screen: pick, manage or create a budget file. */
export function BudgetFilesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation("auth");
  const { t: tc } = useTranslation("common");
  const accent = useThemeColor("accent");
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
              await useSessionStore.getState().signOut();
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
    <View className="flex-1">
      <ScreenHeader.ScrollArea>
        <ScreenHeader.Body
          contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: insets.bottom + 64 }}
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
        </ScreenHeader.Body>

        <ScreenHeader.Floating>
          <View style={{ height: insets.top }} />
          <ScreenHeader>
            <ScreenHeader.Back>
              <LinkButton size="sm" onPress={handleLogout}>
                <LinkButton.Label className="text-muted">{t("logOut")}</LinkButton.Label>
              </LinkButton>
            </ScreenHeader.Back>
            <ScreenHeader.Title>{t("openBudget")}</ScreenHeader.Title>
            <ScreenHeader.Actions>
              <LinkButton size="sm" onPress={() => router.push("/(files)/new-budget")}>
                <LinkButton.Label className="text-accent">{t("new")}</LinkButton.Label>
              </LinkButton>
            </ScreenHeader.Actions>
          </ScreenHeader>
        </ScreenHeader.Floating>
      </ScreenHeader.ScrollArea>

      <FileActionsSheet
        file={actionsFile}
        onClose={() => setActionsFile(null)}
        onAction={handleFileAction}
      />
      <ConfirmDialog request={confirm} onClose={() => setConfirm(null)} />

      <LoadingOverlay visible={switching !== null} />
    </View>
  );
}
