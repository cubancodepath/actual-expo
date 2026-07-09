import { useEffect, useState } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { Button, Dialog, Spinner, useThemeColor } from "heroui-native";
import { useSyncStore } from "@/stores/syncStore";
import { emitErrorEvent } from "@/lib/errors/ErrorChannel";
import { redownloadBudget, resetSyncBudget } from "@/services/syncRecovery";

type ConflictAction = "download" | "upload";

/**
 * Dialog for server file-state sync conflicts (the file was reset,
 * re-encrypted, or its sync format changed on another client). Purely
 * declarative: renders off syncStore.conflictCode — the single source of
 * truth set by syncRecovery — and the chosen recovery action clears it.
 * Mounted once in app/_layout.tsx.
 */
export function SyncConflictDialog() {
  const { t } = useTranslation("common");
  const accentForeground = useThemeColor("accent-foreground");

  const conflictCode = useSyncStore((s) => s.conflictCode);
  // Cancel hides the dialog but keeps the conflict (sync stays paused);
  // a new/changed conflict shows it again.
  const [dismissed, setDismissed] = useState(false);
  const [busy, setBusy] = useState<ConflictAction | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setDismissed(false);
    setBusy(null);
    setFailed(false);
  }, [conflictCode]);

  if (!conflictCode) return null;

  // file-old-version: the local file can't stay as-is either way, so the only
  // offer is resetting sync (re-upload with the current format).
  const isOldVersion = conflictCode === "sync/file-old-version";

  async function run(action: ConflictAction) {
    if (busy) return;
    setFailed(false);
    setBusy(action);
    try {
      // Success clears conflictCode in syncRecovery, which closes the dialog.
      await (action === "download" ? redownloadBudget() : resetSyncBudget());
    } catch (e) {
      emitErrorEvent(e, { operation: "syncConflict." + action });
      setBusy(null);
      setFailed(true);
    }
  }

  return (
    <Dialog isOpen={!dismissed} onOpenChange={(open) => !open && !busy && setDismissed(true)}>
      <Dialog.Portal>
        <Dialog.Overlay />
        <Dialog.Content>
          <View className="mb-5 gap-1.5">
            <Dialog.Title>
              {isOldVersion ? t("syncConflict.oldVersionTitle") : t("syncConflict.resetTitle")}
            </Dialog.Title>
            <Dialog.Description>
              {isOldVersion
                ? t("syncConflict.oldVersionDescription")
                : t("syncConflict.resetDescription")}
            </Dialog.Description>
          </View>

          <View className="gap-3">
            {!isOldVersion && (
              <Button variant="danger" onPress={() => run("download")} isDisabled={!!busy}>
                {busy === "download" && <Spinner size="sm" color={accentForeground} />}
                <Button.Label>{t("syncConflict.revertToServer")}</Button.Label>
              </Button>
            )}
            <Button variant="primary" onPress={() => run("upload")} isDisabled={!!busy}>
              {busy === "upload" && <Spinner size="sm" color={accentForeground} />}
              <Button.Label>
                {isOldVersion ? t("syncConflict.resetSync") : t("syncConflict.uploadThisDevice")}
              </Button.Label>
            </Button>
            <Button variant="ghost" onPress={() => setDismissed(true)} isDisabled={!!busy}>
              <Button.Label>{t("cancel")}</Button.Label>
            </Button>
          </View>

          {failed && (
            <Dialog.Description className="mt-3">
              {t("syncConflict.actionFailed")}
            </Dialog.Description>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog>
  );
}
