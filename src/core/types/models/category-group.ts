import type { Category } from "./category";

export type CategoryGroup = {
  id: string;
  name: string;
  is_income: boolean;
  sort_order: number | null;
  hidden: boolean;
  tombstone: boolean;
  categories?: Category[];
};
