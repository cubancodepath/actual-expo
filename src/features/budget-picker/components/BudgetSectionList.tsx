import { View } from "react-native";
import { useTranslation } from "react-i18next";
import Animated, { FadeOutLeft, LinearTransition } from "react-native-reanimated";
import { useThemeColor } from "@/ui";
import { SectionHeader, SwipeableRow } from "@/ui/molecules";
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
  onDelete: (file: ReconciledBudgetFile, fromServer?: boolean) => void;
  onUpload: (file: ReconciledBudgetFile) => void;
  onDownload: (file: ReconciledBudgetFile) => void;
  onConvertToLocal: (file: ReconciledBudgetFile) => void;
  onReRegister: (file: ReconciledBudgetFile) => void;
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
  onDownload,
  onConvertToLocal,
  onReRegister,
}: {
  title: string;
  files: ReconciledBudgetFile[];
  banner?: React.ReactNode;
  selecting: string | null;
  actionInProgress: string | null;
  onSelect: (file: ReconciledBudgetFile) => void;
  onDelete: (file: ReconciledBudgetFile, fromServer?: boolean) => void;
  onUpload: (file: ReconciledBudgetFile) => void;
  onDownload: (file: ReconciledBudgetFile) => void;
  onConvertToLocal: (file: ReconciledBudgetFile) => void;
  onReRegister: (file: ReconciledBudgetFile) => void;
}) {
  const accentColor = useThemeColor("accent");

  if (files.length === 0) return null;

  return (
    <View className="gap-2">
      <SectionHeader title={title} />
      {banner}
      <Animated.View className="gap-1" layout={LinearTransition}>
        {files.map((file) => (
          <Animated.View
            key={fileKey(file)}
            exiting={FadeOutLeft.duration(200)}
            layout={LinearTransition}
          >
            <SwipeableRow
              onDelete={() => onDelete(file)}
              onSwipeRight={file.state === "local" ? () => onUpload(file) : undefined}
              swipeRightIcon={file.state === "local" ? "CloudUpload" : undefined}
              swipeRightColor={file.state === "local" ? accentColor : undefined}
            >
              <BudgetFileRow
                file={file}
                isSelecting={selecting === fileKey(file)}
                isActionInProgress={actionInProgress === fileKey(file)}
                onPress={() => onSelect(file)}
                onUpload={onUpload}
                onDelete={onDelete}
                onDownload={onDownload}
                onConvertToLocal={onConvertToLocal}
                onReRegister={onReRegister}
              />
            </SwipeableRow>
          </Animated.View>
        ))}
      </Animated.View>
    </View>
  );
}

export function BudgetSectionList({
  localFiles,
  remoteFiles,
  hasDetached,
  ...rest
}: BudgetSectionListProps) {
  const { t } = useTranslation("auth");

  return (
    <View className="gap-8">
      <FileSection
        title={t("onThisDevice")}
        files={localFiles}
        banner={hasDetached ? <DetachedBanner /> : undefined}
        {...rest}
      />
      <FileSection title={t("availableOnServer")} files={remoteFiles} {...rest} />
    </View>
  );
}
