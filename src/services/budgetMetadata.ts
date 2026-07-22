// Budget metadata moved to the core server layer (`@/core/server/prefs`), the
// mobile analogue of upstream's loot-core/src/server/prefs. This re-export keeps
// existing `@/services/budgetMetadata` import sites working; prefer importing
// from `@/core/server/prefs` in new code.
export {
  BUDGETS_DIR,
  getBudgetDir,
  getMetadataPath,
  ensureBudgetsDir,
  budgetExists,
  deleteBudgetDir,
  readMetadata,
  writeMetadata,
  updateMetadata,
  getBudgets,
  idFromBudgetName,
  type BudgetMetadata,
} from "@/core/server/prefs";
