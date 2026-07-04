export { ActualError } from "./ActualError";
export { normalizeError } from "./normalizeError";
export { CODE_META } from "./codes";
export type { ErrorCode, RecoveryAction } from "./codes";
export { ERROR_POLICY, policyFor } from "./policy";
export type { ErrorDisplay, ErrorPolicy } from "./policy";

// Legacy — removed once every producer/consumer is migrated (see plan commit 8).
export { PostError } from "./PostError";
export { SyncError } from "./SyncError";
export { toAppError } from "./toAppError";
export type { AppError, ErrorCategory } from "./AppError";
