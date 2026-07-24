// One-shot guard for the automatic sync recoveries — a leaf module (imports
// nothing but a type) so both budgetfiles (clears it on a budget switch) and
// syncRecovery (arms/checks it) can share it without an operations↔operations
// import cycle.
//
// Why a guard: if e.g. resetSync's own upload gets rejected again, retrying in
// a loop would hammer the server — fall through to the conflict dialog instead.
// Cleared on any successful recovery and on a budget switch.
import type { ErrorCode } from "@/core/errors";

const attempted = new Set<ErrorCode>();

export function hasAttemptedRecovery(code: ErrorCode): boolean {
  return attempted.has(code);
}

export function markRecoveryAttempted(code: ErrorCode): void {
  attempted.add(code);
}

export function clearAutoRecoveryGuard(): void {
  attempted.clear();
}
