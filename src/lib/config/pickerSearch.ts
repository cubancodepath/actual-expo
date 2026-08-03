import type { ParseKeys } from "i18next";
import type { SearchBarPlacement } from "react-native-screens";

/**
 * A picker's search bar, described once for both the people who declare it.
 *
 * A native search bar is declared twice on the way in. The route seeds it so the
 * first native commit already has one (`usePickerHeaderOptions`), and then the
 * screen's `Stack.SearchBar` registers — expo-router runs that in a layout
 * effect, after the first commit — and its props REPLACE the seeded key
 * wholesale rather than merging into it.
 *
 * The seed is what stops the bar (and, where the navigator hid it, the whole
 * header) from popping in on the second frame. It is NOT what decides whether
 * the bar then moves around: see `CATEGORY_SEARCH` for that, which is a
 * placement question the native side settles on its own schedule.
 *
 * One object for both sides so they can't drift, with the placeholder as a KEY
 * so they can't drift on the text either.
 */
export type PickerSearch = {
  placement: SearchBarPlacement;
  /** Key in the `transactions` namespace, resolved identically on both sides. */
  placeholderKey: ParseKeys<"transactions">;
};

/**
 * Stacked, like every other search in the app — deliberately NOT `"integrated"`.
 *
 * An integrated bar is allowed to be moved into the bottom toolbar, and on iOS
 * 26 UIKit decides that late: react-native-screens configures the header
 * several times of its own accord ("we're calling this method 2 additional
 * times before UIKit does… only for the third time, UIKit wants to integrate
 * the search bar", RNSScreenStackHeaderConfig.mm), so the field is drawn in the
 * navigation bar first and drops to the toolbar afterwards. That trip is
 * visible, and no amount of matching up the JS passes prevents it because the
 * passes are the library's, not ours.
 *
 * `"stacked"` has nowhere to travel to — the native side turns toolbar
 * integration off outright for it — so the field appears in its own row under
 * the title on the first frame and stays there.
 */
export const CATEGORY_SEARCH: PickerSearch = {
  placement: "stacked",
  placeholderKey: "searchCategories",
};

/** Payees keep theirs stacked in its own full-width row under the title. */
export const PAYEE_SEARCH: PickerSearch = {
  placement: "stacked",
  placeholderKey: "searchPayees",
};

/**
 * Transaction search. Stacked, and its placeholder changes to "refine" once
 * there are filters — a later, deliberate change, not a first-frame flash, so
 * seeding the empty-state text is right.
 */
export const TRANSACTION_SEARCH: PickerSearch = {
  placement: "stacked",
  placeholderKey: "search.placeholder",
};
