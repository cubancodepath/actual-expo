/**
 * The income field's state, lifted out of the card that draws it.
 *
 * The keypad is a screen-level overlay, not a card-level one: the body has to
 * pad itself so the list isn't buried under the pad, and a tap anywhere in it
 * has to dismiss. Both need the open state, so the state can't live inside the
 * card — `EditBudgetScreen` owns it and hands it to `<AmountKeyboard>`, and the
 * card reads the value back out of that context.
 */

import { useCallback, useEffect, useState } from "react";
import { useMonthlyIncome } from "./useMonthlyIncome";

export interface IncomeEditor {
  /** Cents currently shown — the draft while editing, the saved pref otherwise. */
  value: number;
  setValue: (cents: number) => void;
  isEditing: boolean;
  onOpenChange: (isOpen: boolean) => void;
}

export function useIncomeEditor(): IncomeEditor {
  const [income, setIncome] = useMonthlyIncome();

  // `draft` is what the card shows, always — the field and the result read the
  // same number, so the total moves with every keystroke instead of lagging a
  // commit behind. The pref is only written on close: each write is a CRDT
  // message, and typing "3650" should sync once, not four times.
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(income);

  // Follows the pref when it changes from somewhere else (another device's
  // sync), but never mid-edit — that would overwrite what's being typed.
  useEffect(() => {
    if (!isEditing) setDraft(income);
  }, [income, isEditing]);

  const onOpenChange = useCallback(
    (next: boolean) => {
      setIsEditing(next);
      if (!next) setIncome(draft);
    },
    [draft, setIncome],
  );

  return { value: draft, setValue: setDraft, isEditing, onOpenChange };
}
