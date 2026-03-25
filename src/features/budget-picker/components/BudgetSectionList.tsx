import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { useThemeColor } from "@/ui";
import { SectionHeader } from "@/ui/molecules";
import { SwipeableRow } from "@/presentation/components";
import { BudgetFileRow } from "./BudgetFileRow";
import { DetachedBanner } from "./DetachedBanner";
import { fileKey } from "../hooks/useBudgetPicker";
import type { ReconciledBudgetFile } from "@/services/budgetfiles";

type BudgetSectionListProps = {
  localFiles: ReconciledBudgetFile[];
  remoteFiles: ReconciledBudgetFile[];
  hasDetached: boolean;
  selecting: string | null;
  actionInProgress: string | null;
  onSelect: (file: ReconciledBudgetFile) => void;
  onDelete: (file: ReconciledBudgetFile) => void;
  onUpload: (file: ReconciledBudgetFile) => void;
  onActions: (file: ReconciledBudgetFile) => void;
};

function FileSection({
  title,
  files,
  banner,
  selecting,
  actionInProgress,
  onSelect,
  onDelete,
  onUpload,
  onActions,
}: {
  title: string;
  files: ReconciledBudgetFile[];
  banner?: React.ReactNode;
  selecting: string | null;
  actionInProgress: string | null;
  onSelect: (file: ReconciledBudgetFile) => void;
  onDelete: (file: ReconciledBudgetFile) => void;
  onUpload?: (file: ReconciledBudgetFile) => void;
  onActions: (file: ReconciledBudgetFile) => void;
}) {
  const accentColor = useThemeColor("accent");

  if (files.length === 0) return null;

  return (
    <View className="gap-2">
      <SectionHeader title={title} />
      {banner}
      <View className="gap-1">
        {files.map((file) => (
          <SwipeableRow
            key={fileKey(file)}
            onDelete={() => onDelete(file)}
            onSwipeRight={onUpload && file.state === "local" ? () => onUpload(file) : undefined}
            swipeRightIcon={onUpload ? "cloudUploadOutline" : undefined}
            swipeRightColor={onUpload ? accentColor : undefined}
          >
            <BudgetFileRow
              file={file}
              isSelecting={selecting === fileKey(file)}
              isActionInProgress={actionInProgress === fileKey(file)}
              onPress={() => onSelect(file)}
              onActionPress={() => onActions(file)}
            />
          </SwipeableRow>
        ))}
      </View>
    </View>
  );
}

export function BudgetSectionList({
  localFiles,
  remoteFiles,
  hasDetached,
  selecting,
  actionInProgress,
  onSelect,
  onDelete,
  onUpload,
  onActions,
}: BudgetSectionListProps) {
  const { t } = useTranslation("auth");

  return (
    <View className="gap-8">
      <FileSection
        title={t("onThisDevice")}
        files={localFiles}
        banner={hasDetached ? <DetachedBanner /> : undefined}
        selecting={selecting}
        actionInProgress={actionInProgress}
        onSelect={onSelect}
        onDelete={onDelete}
        onUpload={onUpload}
        onActions={onActions}
      />
      <FileSection
        title={t("availableOnServer")}
        files={remoteFiles}
        selecting={selecting}
        actionInProgress={actionInProgress}
        onSelect={onSelect}
        onDelete={onDelete}
        onActions={onActions}
      />
    </View>
  );
}
