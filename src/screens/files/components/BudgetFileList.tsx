import { useState, type ReactNode } from "react";
import { RefreshControl, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { Alert as HeroAlert, ListGroup, Spinner, Typography, useThemeColor } from "heroui-native";
import { ScreenHeader } from "@/ui/ScreenHeader";
import { InlineError } from "@/ui/feedback/InlineError";
import { ConfirmDialog, type ConfirmRequest } from "@/ui/feedback/ConfirmDialog";
import { BudgetFileRow, type RowRect } from "@/ui/BudgetFileRow";
import { LoadingOverlay } from "@/ui/LoadingOverlay";
import { useBudgetFiles, fileKey } from "@/screens/files/hooks/useBudgetFiles";
import { BudgetFileRowMenuHost } from "./BudgetFileRowMenuHost";
import { buildActionRequest } from "./confirmRequests";
import type { FileAction } from "./fileActions";
import type { ReconciledBudgetFile } from "@/core/server/budgetfiles/app";

interface BudgetFileListProps {
  /** Content rendered inside `ScreenHeader.Floating` (insets spacer + `ScreenHeader`). */
  header: ReactNode;
  /**
   * What tapping a row means for this screen. `select` opens/downloads the file
   * through the list's own hook instance (so the switching loader stays in sync)
   * and resolves true once switched — call it, wrap it, or skip it (e.g. the
   * switcher taps the already-active file to just go back).
   */
  onSelect: (file: ReconciledBudgetFile, select: () => Promise<boolean>) => void;
  /** Marks/disables the row of the currently open budget (the switcher passes it). */
  activeBudgetId?: string | null;
  /** Freeze scrolling/refresh while a budget is being switched (switcher only). */
  lockScrollWhileSwitching?: boolean;
  /** Warn that detached files exist (post-login only). */
  showDetachedAlert?: boolean;
  /** Extra content under the empty-state text (e.g. a "Create budget" button). */
  emptyExtra?: ReactNode;
}

/**
 * The reusable "list of budget files": data, sections, the long-press lift menu,
 * the file-action confirm flow, and the switching loader. Screens supply only
 * their own header and what a row tap does — see BudgetFilesScreen (post-login)
 * and ChangeBudgetScreen (in-app switcher).
 */
export function BudgetFileList({
  header,
  onSelect,
  activeBudgetId,
  lockScrollWhileSwitching,
  showDetachedAlert,
  emptyExtra,
}: BudgetFileListProps) {
  const insets = useSafeAreaInsets();
  const { t: ta } = useTranslation("auth");
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

  const isSwitching = switching !== null;
  const scrollLocked = lockScrollWhileSwitching && isSwitching;
  const hasFiles = localFiles.length > 0 || remoteFiles.length > 0;
  const hasDetached = localFiles.some((f) => f.state === "detached");

  function handleFileAction(action: FileAction, file: ReconciledBudgetFile) {
    if (action === "download") {
      onSelect(file, () => selectFile(file));
      return;
    }
    setConfirm(
      buildActionRequest(
        action,
        file,
        { t: ta, tc },
        {
          deleteFile,
          uploadFile,
          convertToLocal,
          reRegister,
        },
      ),
    );
  }

  function renderSection(
    title: string,
    files: ReconciledBudgetFile[],
    liftedKey: string | null,
    onLongPressRow: (file: ReconciledBudgetFile, rect: RowRect) => void,
  ) {
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
              isActive={activeBudgetId != null && !isSwitching && file.localId === activeBudgetId}
              isSelecting={switching?.key === fileKey(file)}
              isActionInProgress={actionInProgress === fileKey(file)}
              isLifted={liftedKey === fileKey(file)}
              onPress={() => onSelect(file, () => selectFile(file))}
              onLongPress={(rect) => onLongPressRow(file, rect)}
              showSeparator={index < files.length - 1}
            />
          ))}
        </ListGroup>
      </>
    );
  }

  return (
    <BudgetFileRowMenuHost className="flex-1" onAction={handleFileAction}>
      {({ liftedKey, onLongPressRow }) => (
        <>
          <ScreenHeader.ScrollArea>
            <ScreenHeader.Body
              contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: insets.bottom + 64 }}
              scrollEnabled={!scrollLocked}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={refresh}
                  tintColor={accent}
                  enabled={!scrollLocked}
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
                    {tc("loading")}
                  </Typography>
                </View>
              ) : hasFiles ? (
                <>
                  {localFiles.length > 0 && (
                    <>
                      {showDetachedAlert && hasDetached && (
                        <View className="mt-6">
                          <HeroAlert status="warning">
                            <HeroAlert.Indicator />
                            <HeroAlert.Content>
                              <HeroAlert.Description>{ta("detachedHint")}</HeroAlert.Description>
                            </HeroAlert.Content>
                          </HeroAlert>
                        </View>
                      )}
                      {renderSection(ta("onThisDevice"), localFiles, liftedKey, onLongPressRow)}
                    </>
                  )}
                  {remoteFiles.length > 0 &&
                    renderSection(ta("availableOnServer"), remoteFiles, liftedKey, onLongPressRow)}
                </>
              ) : (
                <View className="items-center gap-2 pt-24">
                  <Typography type="body" weight="semibold">
                    {ta("noBudgetsFound")}
                  </Typography>
                  <Typography type="body-sm" color="muted" className="text-center">
                    {ta("noBudgetsDescription")}
                  </Typography>
                  {emptyExtra}
                </View>
              )}
            </ScreenHeader.Body>

            <ScreenHeader.Floating>{header}</ScreenHeader.Floating>
          </ScreenHeader.ScrollArea>

          <ConfirmDialog request={confirm} onClose={() => setConfirm(null)} />
          <LoadingOverlay visible={isSwitching} />
        </>
      )}
    </BudgetFileRowMenuHost>
  );
}
