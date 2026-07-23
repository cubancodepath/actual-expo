/**
 * The long-pressed category row a lift menu opens on. Rows build this and hand
 * it (with their measured frame) to the screen's `LiftMenu.Host`, which
 * branches on `isIncome` to pick the menu.
 */
export interface LiftedCategory {
  catId: string;
  catName: string;
  /** The category's Available balance; the move-money screen seeds from it (0 for income). */
  balance: number;
  /** Rollover (expense) / auto-hold (income) flag — labels the menu's toggle. */
  carryover: boolean;
  /** Income rows get the auto-hold menu; expense rows the full category menu. */
  isIncome: boolean;
}
