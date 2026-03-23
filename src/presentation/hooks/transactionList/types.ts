import type { TransactionDisplay } from "../../../transactions";
import type { PreviewTransaction } from "../../../schedules/computePreview";

export type DateHeader = { type: "date"; date: number; key: string; dailyTotal: number };
export type TransactionItem = {
  type: "transaction";
  data: TransactionDisplay;
  key: string;
  isFirst: boolean;
  isLast: boolean;
};
export type UpcomingHeader = {
  type: "upcoming-header";
  key: string;
  count: number;
  expanded: boolean;
};
export type UpcomingDateHeader = {
  type: "upcoming-date";
  date: number;
  key: string;
};
export type UpcomingItem = {
  type: "upcoming";
  data: PreviewTransaction;
  key: string;
  isFirst: boolean;
  isLast: boolean;
};

export type EmptyStateItem = {
  type: "empty-state";
  key: string;
  variant: "reconciled" | "no-transactions";
};

export type ListItem =
  | DateHeader
  | TransactionItem
  | UpcomingHeader
  | UpcomingDateHeader
  | UpcomingItem
  | EmptyStateItem;

export function buildListData(
  transactions: TransactionDisplay[],
  opts?: {
    previewTransactions?: PreviewTransaction[];
    upcomingExpanded?: boolean;
    hideReconciled?: boolean;
  },
): ListItem[] {
  const items: ListItem[] = [];

  // Prepend upcoming section if preview transactions exist
  const previews = opts?.previewTransactions ?? [];
  if (previews.length > 0) {
    const expanded = opts?.upcomingExpanded ?? false;
    items.push({
      type: "upcoming-header",
      key: "upcoming-header",
      count: previews.length,
      expanded,
    });

    if (expanded) {
      let lastDate: number | null = null;

      for (let i = 0; i < previews.length; i++) {
        const preview = previews[i];
        const isNewDate = preview.date !== lastDate;

        if (isNewDate) {
          if (items.length > 0) {
            const prev = items[items.length - 1];
            if (prev.type === "upcoming") prev.isLast = true;
          }
          items.push({
            type: "upcoming-date",
            date: preview.date,
            key: `upcoming-date-${preview.date}`,
          });
          lastDate = preview.date;
        }

        items.push({
          type: "upcoming",
          data: preview,
          key: preview.id,
          isFirst: isNewDate,
          isLast: false,
        });
      }

      if (items.length > 1) {
        const last = items[items.length - 1];
        if (last.type === "upcoming") last.isLast = true;
      }
    }
  }

  // Inject empty state when schedules exist but no visible transactions
  if (previews.length > 0 && transactions.length === 0) {
    items.push({
      type: "empty-state",
      key: "empty-state",
      variant: opts?.hideReconciled ? "reconciled" : "no-transactions",
    });
  }

  // Pre-compute daily totals
  const dailyTotals = new Map<number, number>();
  for (const txn of transactions) {
    dailyTotals.set(txn.date, (dailyTotals.get(txn.date) ?? 0) + txn.amount);
  }

  // Regular transactions grouped by date
  let lastDate: number | null = null;

  for (let i = 0; i < transactions.length; i++) {
    const txn = transactions[i];
    const isNewDate = txn.date !== lastDate;
    if (isNewDate) {
      if (items.length > 0) {
        const prev = items[items.length - 1];
        if (prev.type === "transaction") prev.isLast = true;
      }
      items.push({
        type: "date",
        date: txn.date,
        key: `date-${txn.date}`,
        dailyTotal: dailyTotals.get(txn.date) ?? 0,
      });
      lastDate = txn.date;
    }
    items.push({
      type: "transaction",
      data: txn,
      key: txn.id,
      isFirst: isNewDate,
      isLast: false,
    });
  }

  if (items.length > 0) {
    const last = items[items.length - 1];
    if (last.type === "transaction") last.isLast = true;
  }

  return items;
}
