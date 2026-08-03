import { useMemo } from "react";
import type { NativeStackNavigationOptions } from "@react-navigation/native-stack";
import type { HeaderActions } from "./types";
import { renderHeaderAction, renderHeaderActionRow } from "./renderHeaderAction";

/**
 * Android variant — see the base file for the rationale.
 *
 * Bar button items are `@platform ios`, so here the actions are RN views. The
 * one thing that must not be dropped is the `tintColor` argument native-stack
 * passes to `headerLeft`/`headerRight`: the native header config's colour does
 * not cascade into these subviews, so an action that ignores it ends up painted
 * in its own palette instead of the header's.
 */
export function useHeaderActionOptions({
  left,
  right,
}: HeaderActions): NativeStackNavigationOptions {
  return useMemo(() => {
    const rights = right ? (Array.isArray(right) ? right : [right]) : [];
    return {
      headerBackVisible: !left,
      headerLeft: left ? ({ tintColor }) => renderHeaderAction(left, tintColor) : undefined,
      // Array order is already visual reading order, which is how a row lays out.
      headerRight:
        rights.length > 0 ? ({ tintColor }) => renderHeaderActionRow(rights, tintColor) : undefined,
    };
  }, [left, right]);
}
