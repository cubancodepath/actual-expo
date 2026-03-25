import { useTranslation } from "react-i18next";
import { EmptyState } from "@/ui/molecules";

type BudgetEmptyStateProps = {
  onCreateNew: () => void;
};

export function BudgetEmptyState({ onCreateNew }: BudgetEmptyStateProps) {
  const { t } = useTranslation("auth");

  return (
    <EmptyState
      icon="Wallet"
      title={t("noBudgetsFound")}
      description={t("noBudgetsDescription")}
      actionLabel={t("createNewBudget")}
      onAction={onCreateNew}
    />
  );
}
