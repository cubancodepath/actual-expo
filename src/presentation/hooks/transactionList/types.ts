import type { TransactionDisplay } from "../../../transactions";
import type { PreviewTransaction } from "../../../schedules/preview";

export type DateHeader = { type: "date"; date: number; key: string };
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
export type UpcomingItem = {
  type: "upcoming";
  data: PreviewTransaction;
  key: string;
  isFirst: boolean;
  isLast: boolean;
};

export type ListItem = DateHeader | TransactionItem | UpcomingHeader | UpcomingItem;

export function buildListData(
  transactions: TransactionDisplay[],
  opts?: {
    previewTransactions?: PreviewTransaction[];
    upcomingExpanded?: boolean;
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
      for (let i = 0; i < previews.length; i++) {
        items.push({
          type: "upcoming",
          data: previews[i],
          key: previews[i].id,
          isFirst: i === 0,
          isLast: i === previews.length - 1,
        });
      }
    }
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
      items.push({ type: "date", date: txn.date, key: `date-${txn.date}` });
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
