import type { ReactNode } from "react";
import { View } from "react-native";

/** Shared column widths so group headers and category rows line up. */
export const COL_ASSIGNED = 96;
export const COL_AVAILABLE = 104;

/** Fixed-width table cell that anchors its content to the right (number or chip). */
export function NumericCell({ width, children }: { width: number; children: ReactNode }) {
  return (
    <View style={{ width }} className="flex-row justify-end">
      {children}
    </View>
  );
}
