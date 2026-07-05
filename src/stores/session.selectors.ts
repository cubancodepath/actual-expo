import { useSessionStore } from "./sessionStore";
import { useBudgetContextStore } from "./budgetContextStore";

// ---------------------------------------------------------------------------
// Derived "isConfigured" — composes session + budget context WITHOUT a god store.
// ---------------------------------------------------------------------------
// The app is "configured" (ready to show the main app) when either it is in
// local-only mode, or it has a token AND an active budget selected.
//   isConfigured = isLocalOnly || (hasToken && !!activeBudgetId)

/** Reactive: use inside React components (auth guard, effects). */
export function useIsConfigured(): boolean {
  const hasToken = useSessionStore((s) => s.hasToken);
  const activeBudgetId = useBudgetContextStore((s) => s.activeBudgetId);
  const isLocalOnly = useBudgetContextStore((s) => s.isLocalOnly);
  return isLocalOnly || (hasToken && !!activeBudgetId);
}

/** Imperative: use in plain modules / .getState() call sites. */
export function getIsConfigured(): boolean {
  const { hasToken } = useSessionStore.getState();
  const { activeBudgetId, isLocalOnly } = useBudgetContextStore.getState();
  return isLocalOnly || (hasToken && !!activeBudgetId);
}
