/**
 * useLocalPref — read/write a single per-device, per-budget preference.
 *
 * Faithful to upstream `desktop-client/src/hooks/useLocalPref`: local prefs are
 * scoped to the active budget (`${budgetId}-${key}`) and never sync. Backed by
 * the app-layer `@/lib/localPrefs` MMKV store; a shared Zustand cache keeps
 * components in sync on write.
 *
 * @example
 * const [collapsed, setCollapsed] = useLocalPref("budget.collapsed");
 */
import { useCallback } from "react";
import { create } from "zustand";
import { useBudgetContextStore } from "@/stores/budgetContextStore";
import { getLocalPref, setLocalPref } from "@/lib/localPrefs";
import type { LocalPrefs } from "@/core/domain/preferences/prefs.types";

// Cache keyed by `${budgetId}-${prefKey}` so switching budgets reads fresh.
const useLocalPrefsCache = create<{ prefs: Record<string, unknown> }>(() => ({ prefs: {} }));

export function useLocalPref<K extends keyof LocalPrefs>(
  key: K,
): [LocalPrefs[K] | undefined, (value: LocalPrefs[K]) => void] {
  const budgetId = useBudgetContextStore((s) => s.activeBudgetId);
  const cacheKey = `${budgetId}-${key}`;

  const value = useLocalPrefsCache((s) =>
    cacheKey in s.prefs ? (s.prefs[cacheKey] as LocalPrefs[K]) : getLocalPref(budgetId, key),
  );

  const set = useCallback(
    (next: LocalPrefs[K]) => {
      setLocalPref(budgetId, key, next);
      useLocalPrefsCache.setState((s) => ({ prefs: { ...s.prefs, [cacheKey]: next } }));
    },
    [budgetId, cacheKey, key],
  );

  return [value as LocalPrefs[K] | undefined, set];
}
