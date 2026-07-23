import type { TFunction } from "i18next";
import type { ConfirmRequest } from "@/ui/feedback/ConfirmDialog";
import type { FileAction } from "@/screens/files/components/fileActions";
import type { ReconciledBudgetFile } from "@/core/server/budgetfiles/app";

type FileActions = {
  deleteFile: (file: ReconciledBudgetFile, fromServer?: boolean) => void;
  uploadFile: (file: ReconciledBudgetFile) => void;
  convertToLocal: (file: ReconciledBudgetFile) => void;
  reRegister: (file: ReconciledBudgetFile) => void;
};

type Translators = {
  t: TFunction<"auth">;
  tc: TFunction<"common">;
};

export function buildDeleteRequest(
  file: ReconciledBudgetFile,
  { t, tc }: Translators,
  { deleteFile }: Pick<FileActions, "deleteFile">,
): ConfirmRequest {
  const name = file.name || t("unnamedBudget");

  if (file.state === "synced") {
    return {
      title: t("deleteBudget"),
      description: t("deleteBudgetSynced", { name }),
      actions: [
        { label: t("deleteLocally"), onPress: () => deleteFile(file, false) },
        {
          label: t("deleteFromAllDevices"),
          isDestructive: true,
          onPress: () => deleteFile(file, true),
        },
      ],
    };
  }
  if (file.state === "remote") {
    return {
      title: t("deleteBudget"),
      description: t("deleteBudgetFromServer", { name }),
      actions: [
        {
          label: t("deleteFromServer"),
          isDestructive: true,
          onPress: () => deleteFile(file, true),
        },
      ],
    };
  }
  return {
    title: t("deleteBudget"),
    description: t("deleteBudgetLocal", { name }),
    actions: [{ label: tc("delete"), isDestructive: true, onPress: () => deleteFile(file, false) }],
  };
}

export function buildUploadRequest(
  file: ReconciledBudgetFile,
  { t, tc }: Translators,
  { uploadFile }: Pick<FileActions, "uploadFile">,
): ConfirmRequest {
  const name = file.name || t("unnamedBudget");
  return {
    title: t("uploadToServer"),
    description: t("uploadBudgetConfirm", { name }),
    actions: [{ label: tc("upload"), onPress: () => uploadFile(file) }],
  };
}

/**
 * Maps a file context-menu action to its confirmation request. Returns null
 * for actions that need no confirmation (download → handled by the caller).
 */
export function buildActionRequest(
  action: FileAction,
  file: ReconciledBudgetFile,
  translators: Translators,
  actions: FileActions,
): ConfirmRequest | null {
  const { t, tc } = translators;
  const name = file.name || t("unnamedBudget");

  switch (action) {
    case "upload":
      return buildUploadRequest(file, translators, actions);
    case "deleteLocal":
    case "deleteEverywhere":
    case "deleteServer":
      return buildDeleteRequest(file, translators, actions);
    case "reRegister":
      return {
        title: t("reUploadToServer"),
        description: t("reUploadConfirm", { name }),
        actions: [{ label: tc("upload"), onPress: () => actions.reRegister(file) }],
      };
    case "keepLocal":
      return {
        title: t("keepLocalOnly"),
        description: t("keepLocalConfirm", { name }),
        actions: [{ label: tc("confirm"), onPress: () => actions.convertToLocal(file) }],
      };
    case "download":
      return null;
  }
}
