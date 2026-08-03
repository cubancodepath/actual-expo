import type { ReactNode } from "react";
import type { HeaderAction } from "@/ui/header-actions/types";
import type { PickerSearch } from "@/lib/config/pickerSearch";

export type NativePickerScreenProps = {
  title: string;
  query: string;
  onQueryChange: (query: string) => void;
  /**
   * The search bar's configuration — the SAME object the route seeds with
   * `usePickerHeaderOptions`, which is what keeps the two declarations from
   * drifting. See {@link PickerSearch} for why that matters.
   */
  search: PickerSearch;
  /**
   * Open with the search field already focused, for pickers whose whole point
   * is to type (payees). Off by default: a picker you mostly scroll should not
   * throw a keyboard over half its own list.
   */
  autoFocus?: boolean;
  /**
   * Replaces the native back button (e.g. a Cancel that leaves a mode instead
   * of popping). Absent = the stack's own back chevron.
   */
  headerLeft?: HeaderAction;
  /** The header's right action (e.g. "Next"). */
  headerRight?: HeaderAction;
  /** The list content, rendered inside the scroll view. */
  children: ReactNode;
};
