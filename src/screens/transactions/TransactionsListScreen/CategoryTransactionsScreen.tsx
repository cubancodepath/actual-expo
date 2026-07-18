import { useTranslation } from "react-i18next";
import { ScreenHeader } from "@/ui/ScreenHeader";
import { TransactionsShell } from "./components/TransactionsShell";

/**
 * One category's activity in a budget month, presented as a modal card (the
 * card already clears the status bar — no top inset).
 */
export function CategoryTransactionsScreen({
  categoryId,
  categoryName,
  month,
}: {
  categoryId: string;
  categoryName?: string;
  /** "YYYY-MM"; defaults to the budget UI store's month. */
  month?: string;
}) {
  const { t } = useTranslation("transactions");

  return (
    <TransactionsShell
      context={{ kind: "category", categoryId, month }}
      header={
        <ScreenHeader>
          <ScreenHeader.Back />
          <ScreenHeader.Title>{categoryName ?? t("list.title")}</ScreenHeader.Title>
        </ScreenHeader>
      }
    />
  );
}
