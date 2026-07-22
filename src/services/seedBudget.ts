// Budget seeding moved to the core server layer
// (`@/core/server/budgetfiles/seed`). This re-export keeps existing
// `@/services/seedBudget` import sites working; prefer the core path in new code.
export {
  DEFAULT_CATEGORY_GROUPS,
  getDefaultCategorySelection,
  seedLocalBudget,
  type CategorySelection,
} from "@/core/server/budgetfiles/seed";
