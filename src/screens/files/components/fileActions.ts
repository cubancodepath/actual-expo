import type { ComponentProps } from "react";
import type { Ionicons } from "@expo/vector-icons";
import type { ReconciledBudgetFile } from "@/core/server/budgetfiles/app";

export type FileAction =
  | "upload"
  | "reRegister"
  | "keepLocal"
  | "download"
  | "deleteLocal"
  | "deleteEverywhere"
  | "deleteServer";

type IoniconName = ComponentProps<typeof Ionicons>["name"];

export type FileActionOption = {
  action: FileAction;
  labelKey: string;
  namespace: "auth" | "settings" | "common";
  icon: IoniconName;
  isDestructive?: boolean;
};

/** Per-file-state action lists, shared by the long-press context menu. */
export const OPTIONS_BY_STATE: Record<ReconciledBudgetFile["state"], FileActionOption[]> = {
  local: [
    {
      action: "upload",
      labelKey: "uploadToServer",
      namespace: "auth",
      icon: "cloud-upload-outline",
    },
    {
      action: "deleteLocal",
      labelKey: "deleteFromDevice",
      namespace: "settings",
      icon: "trash-outline",
      isDestructive: true,
    },
  ],
  synced: [
    {
      action: "deleteLocal",
      labelKey: "deleteFromDevice",
      namespace: "settings",
      icon: "phone-portrait-outline",
    },
    {
      action: "deleteEverywhere",
      labelKey: "deleteFromAllDevices",
      namespace: "settings",
      icon: "trash-outline",
      isDestructive: true,
    },
  ],
  detached: [
    {
      action: "reRegister",
      labelKey: "reUploadToServer",
      namespace: "auth",
      icon: "cloud-upload-outline",
    },
    {
      action: "keepLocal",
      labelKey: "keepLocalOnly",
      namespace: "auth",
      icon: "phone-portrait-outline",
    },
    {
      action: "deleteLocal",
      labelKey: "deleteFromDevice",
      namespace: "settings",
      icon: "trash-outline",
      isDestructive: true,
    },
  ],
  remote: [
    {
      action: "download",
      labelKey: "download",
      namespace: "common",
      icon: "cloud-download-outline",
    },
    {
      action: "deleteServer",
      labelKey: "deleteFromServer",
      namespace: "auth",
      icon: "trash-outline",
      isDestructive: true,
    },
  ],
};
