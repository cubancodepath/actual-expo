import type { ReactNode } from "react";
import type { SearchBarPlacement } from "react-native-screens";
import type { HeaderAction } from "@/ui/header-actions/types";

export type NativePickerScreenProps = {
  title: string;
  query: string;
  onQueryChange: (query: string) => void;
  searchPlaceholder: string;
  /**
   * Where the native search bar sits. iOS only — Android has one placement.
   *
   * - `"stacked"` (default): its own full-width row under the title.
   * - `"integrated"`: on iOS 26 the system may move it into the bottom toolbar,
   *   within thumb reach. On iOS 16–25 there is no such placement and it falls
   *   back to the small trailing-edge field next to the title.
   */
  searchPlacement?: SearchBarPlacement;
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
