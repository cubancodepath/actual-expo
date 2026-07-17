import { createContext, useContext, useRef, type ReactNode } from "react";
import { useGlobalSearchParams } from "expo-router";
import { useGoalAutomations } from "../hooks/useGoalAutomations";

type GoalAutomationsValue = ReturnType<typeof useGoalAutomations>;

const GoalAutomationsContext = createContext<GoalAutomationsValue | null>(null);

/**
 * Holds the Edit Goals draft above the goal stack, so the list, the editor
 * and the mode screen all read and mutate the same in-memory state across
 * native pushes — the same arrangement the transaction stack uses.
 *
 * The stack is always entered via the list route, so on first render the
 * active route's params are the ones we want. They're frozen so pushing an
 * inner screen (which changes the global params) never re-inits the draft.
 */
export function GoalAutomationsProvider({ children }: { children: ReactNode }) {
  const rawParams = useGlobalSearchParams<{ categoryId?: string; dismissCount?: string }>();
  const params = useRef(rawParams).current;

  const value = useGoalAutomations({
    categoryId: params.categoryId ?? "",
    dismissCount: params.dismissCount,
  });

  return <GoalAutomationsContext value={value}>{children}</GoalAutomationsContext>;
}

export function useGoalAutomationsContext(): GoalAutomationsValue {
  const ctx = useContext(GoalAutomationsContext);
  if (!ctx) {
    throw new Error("useGoalAutomationsContext must be used within a GoalAutomationsProvider");
  }
  return ctx;
}
