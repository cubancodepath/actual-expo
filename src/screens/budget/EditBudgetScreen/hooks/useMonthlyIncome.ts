/**
 * What the user says they earn in a month — the other half of "can I live on
 * this?", and the only half the app can't work out for itself.
 *
 * Deriving it was the alternative, and it's a trap: `total-income` is one
 * month's deposits (a bonus or a late paycheck swings it), and averaging past
 * income silently mislabels an unusual stretch as normal. Neither can be
 * corrected by the one person who knows the real answer. So we ask.
 *
 * Stored as a synced pref, because it describes the budget rather than the
 * device and should follow the user between phones. Divergence: upstream has no
 * such pref, so this key is ours — `SyncedPrefs` in core/types stays a faithful
 * mirror and doesn't declare it, and `useSyncedPref` takes arbitrary keys and
 * routes them through `setArbitraryPref`. The desktop client will replicate the
 * row and ignore it.
 */

import { useCallback } from "react";
import { useSyncedPref } from "@/hooks/useSyncedPrefs";

/** Synced pref key. Value is an integer number of cents, as a string. */
const MONTHLY_INCOME_PREF = "monthlyIncome";

/**
 * Unset reads as zero rather than as its own state: the card shows the field at
 * 0.00 and lets the user type over it, which is a shorter road to an answer than
 * a prompt that has to be dismissed before it becomes an input.
 */
export function useMonthlyIncome(): [number, (cents: number) => void] {
  const [raw, setRaw] = useSyncedPref(MONTHLY_INCOME_PREF);

  const parsed = Number.parseInt(raw, 10);
  const cents = Number.isNaN(parsed) ? 0 : parsed;

  const set = useCallback((next: number) => void setRaw(String(Math.round(next))), [setRaw]);

  return [cents, set];
}
