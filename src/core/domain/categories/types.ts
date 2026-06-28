export type CategoryGroup = {
  id: string;
  name: string;
  is_income: boolean;
  sort_order: number | null;
  hidden: boolean;
  tombstone: boolean;
  categories?: Category[];
};

export type Category = {
  id: string;
  name: string;
  is_income: boolean;
  cat_group: string;
  sort_order: number | null;
  hidden: boolean;
  goal_def: string | null;
  tombstone: boolean;
};
