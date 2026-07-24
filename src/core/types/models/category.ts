export type Category = {
  id: string;
  name: string;
  is_income: boolean;
  /** Owning category group. Named `group` to match upstream's AQL entity (the
   *  physical DB column is `cat_group`; the AQL `v_categories` view renames it). */
  group: string;
  sort_order: number | null;
  hidden: boolean;
  goal_def: string | null;
  tombstone: boolean;
};
