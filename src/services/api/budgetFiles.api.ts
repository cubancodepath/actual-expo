// The remote budget-file listing moved to the core cloud-storage transport
// (`@/core/server/cloud-storage`, upstream's `listRemoteFiles`). This re-export
// keeps existing `@/services/api/budgetFiles.api` import sites working; prefer
// importing from `@/core/server/cloud-storage` in new code.
export { getRemoteFiles, type RemoteBudgetFile } from "@/core/server/cloud-storage";
