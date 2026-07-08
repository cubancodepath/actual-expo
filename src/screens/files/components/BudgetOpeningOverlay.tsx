import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { Spinner, Typography, useThemeColor } from "heroui-native";

type BudgetOpenPhase = "downloading" | "opening";

interface BudgetOpeningOverlayProps {
  visible: boolean;
  phase?: BudgetOpenPhase;
  budgetName?: string | null;
}

/** Full-screen HUD shown while a budget downloads/opens. */
export function BudgetOpeningOverlay({
  visible,
  phase = "opening",
  budgetName,
}: BudgetOpeningOverlayProps) {
  const { t } = useTranslation();
  const accent = useThemeColor("accent");

  if (!visible) return null;

  return (
    <View
      className="absolute inset-0 z-50 items-center justify-center bg-black/40"
      pointerEvents="box-only"
    >
      <View className="min-w-[200px] items-center rounded-2xl bg-surface p-8">
        <Spinner size="lg" color={accent} />
        <Typography type="body" weight="semibold" className="mt-4 text-center">
          {phase === "downloading" ? t("budget.downloading") : t("budget.opening")}
        </Typography>
        {budgetName && (
          <Typography type="body-sm" color="muted" className="mt-1 text-center">
            {budgetName}
          </Typography>
        )}
      </View>
    </View>
  );
}
