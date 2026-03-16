import { ActionSheetIOS, Alert, Platform } from "react-native";
import { useTranslation } from "react-i18next";
import type { ReconciledBudgetFile } from "../../services/budgetfiles";

type FileActions = {
  uploadFile: (file: ReconciledBudgetFile) => Promise<void>;
  deleteFile: (file: ReconciledBudgetFile, fromServer?: boolean) => Promise<void>;
  selectFile: (file: ReconciledBudgetFile) => Promise<void>;
  convertToLocal: (file: ReconciledBudgetFile) => Promise<void>;
  reRegister: (file: ReconciledBudgetFile) => Promise<void>;
};

export function useFileActionSheet(actions: FileActions) {
  const { t } = useTranslation("auth");
  const { t: tc } = useTranslation("common");
  const { t: ts } = useTranslation("settings");

  function showActions(file: ReconciledBudgetFile) {
    const name = file.name || t("unnamedBudget");

    switch (file.state) {
      case "local":
        return showLocalActions(file, name);
      case "synced":
        return showSyncedActions(file, name);
      case "detached":
        return showDetachedActions(file, name);
      case "remote":
        return showRemoteActions(file, name);
    }
  }

  function showLocalActions(file: ReconciledBudgetFile, name: string) {
    const options = [t("uploadToServer"), ts("deleteFromDevice"), tc("cancel")];
    const destructiveIndex = 1;
    const cancelIndex = 2;

    const handler = (index: number) => {
      if (index === 0) {
        Alert.alert(t("uploadToServer"), t("uploadBudgetConfirm", { name }), [
          { text: tc("cancel"), style: "cancel" },
          { text: tc("upload"), onPress: () => actions.uploadFile(file).catch(() => {}) },
        ]);
      } else if (index === 1) {
        Alert.alert(t("deleteBudget"), t("deleteBudgetLocal", { name }), [
          { text: tc("cancel"), style: "cancel" },
          {
            text: tc("delete"),
            style: "destructive",
            onPress: () => actions.deleteFile(file, false).catch(() => {}),
          },
        ]);
      }
    };

    showSheet(options, cancelIndex, destructiveIndex, handler);
  }

  function showSyncedActions(file: ReconciledBudgetFile, name: string) {
    const options = [ts("deleteFromDevice"), ts("deleteFromAllDevices"), tc("cancel")];
    const destructiveIndex = 1;
    const cancelIndex = 2;

    const handler = (index: number) => {
      if (index === 0) {
        Alert.alert(t("deleteBudget"), t("deleteBudgetLocal", { name }), [
          { text: tc("cancel"), style: "cancel" },
          {
            text: tc("delete"),
            style: "destructive",
            onPress: () => actions.deleteFile(file, false).catch(() => {}),
          },
        ]);
      } else if (index === 1) {
        Alert.alert(t("deleteBudget"), t("deleteBudgetSynced", { name }), [
          { text: tc("cancel"), style: "cancel" },
          {
            text: t("deleteFromAllDevices"),
            style: "destructive",
            onPress: () => actions.deleteFile(file, true).catch(() => {}),
          },
        ]);
      }
    };

    showSheet(options, cancelIndex, destructiveIndex, handler);
  }

  function showDetachedActions(file: ReconciledBudgetFile, name: string) {
    const options = [
      t("reUploadToServer"),
      t("keepLocalOnly"),
      ts("deleteFromDevice"),
      tc("cancel"),
    ];
    const destructiveIndex = 2;
    const cancelIndex = 3;

    const handler = (index: number) => {
      if (index === 0) {
        Alert.alert(t("reUploadToServer"), t("reUploadConfirm", { name }), [
          { text: tc("cancel"), style: "cancel" },
          { text: tc("upload"), onPress: () => actions.reRegister(file).catch(() => {}) },
        ]);
      } else if (index === 1) {
        Alert.alert(t("keepLocalOnly"), t("keepLocalConfirm", { name }), [
          { text: tc("cancel"), style: "cancel" },
          { text: tc("confirm"), onPress: () => actions.convertToLocal(file).catch(() => {}) },
        ]);
      } else if (index === 2) {
        Alert.alert(t("deleteBudget"), t("deleteBudgetLocal", { name }), [
          { text: tc("cancel"), style: "cancel" },
          {
            text: tc("delete"),
            style: "destructive",
            onPress: () => actions.deleteFile(file, false).catch(() => {}),
          },
        ]);
      }
    };

    showSheet(options, cancelIndex, destructiveIndex, handler);
  }

  function showRemoteActions(file: ReconciledBudgetFile, name: string) {
    const options = [tc("download"), t("deleteFromServer"), tc("cancel")];
    const destructiveIndex = 1;
    const cancelIndex = 2;

    const handler = (index: number) => {
      if (index === 0) {
        actions.selectFile(file).catch(() => {});
      } else if (index === 1) {
        Alert.alert(t("deleteBudget"), t("deleteBudgetFromServer", { name }), [
          { text: tc("cancel"), style: "cancel" },
          {
            text: t("deleteFromServer"),
            style: "destructive",
            onPress: () => actions.deleteFile(file, true).catch(() => {}),
          },
        ]);
      }
    };

    showSheet(options, cancelIndex, destructiveIndex, handler);
  }

  return { showActions };
}

function showSheet(
  options: string[],
  cancelIndex: number,
  destructiveIndex: number,
  handler: (index: number) => void,
) {
  if (Platform.OS === "ios") {
    ActionSheetIOS.showActionSheetWithOptions(
      { options, cancelButtonIndex: cancelIndex, destructiveButtonIndex: destructiveIndex },
      handler,
    );
  } else {
    // On Android, use Alert with buttons (skip cancel, it's implicit)
    const buttons = options
      .filter((_, i) => i !== cancelIndex)
      .map((label, i) => ({
        text: label,
        style: (i === destructiveIndex ? "destructive" : "default") as "destructive" | "default",
        onPress: () => handler(i),
      }));
    buttons.push({ text: options[cancelIndex], style: "default" as const, onPress: () => {} });
    Alert.alert("", "", buttons);
  }
}
