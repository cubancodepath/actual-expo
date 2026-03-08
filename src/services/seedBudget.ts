import { batchMessages } from '../sync';
import { createAccount } from '../accounts';
import { createCategoryGroup, createCategory } from '../categories';
import { refreshAllRegisteredStores } from '../stores/storeRegistry';

// ---------------------------------------------------------------------------
// Default category data — matches what Actual Budget server bundles
// ---------------------------------------------------------------------------

export const DEFAULT_CATEGORY_GROUPS = [
  {
    key: 'usual',
    name: 'Usual Expenses',
    is_income: false,
    categories: [
      { key: 'food', name: 'Food' },
      { key: 'general', name: 'General' },
      { key: 'bills', name: 'Bills' },
      { key: 'bills_flexible', name: 'Bills (Flexible)' },
    ],
  },
  {
    key: 'income',
    name: 'Income',
    is_income: true,
    categories: [
      { key: 'income', name: 'Income' },
      { key: 'starting_balances', name: 'Starting Balances' },
    ],
  },
  {
    key: 'investments',
    name: 'Investments and Savings',
    is_income: false,
    categories: [
      { key: 'savings', name: 'Savings' },
    ],
  },
] as const;

// ---------------------------------------------------------------------------
// Category selection helpers
// ---------------------------------------------------------------------------

export type CategorySelection = Record<string, boolean>;

export function getDefaultCategorySelection(): CategorySelection {
  const sel: CategorySelection = {};
  for (const group of DEFAULT_CATEGORY_GROUPS) {
    for (const cat of group.categories) {
      sel[cat.key] = true;
    }
  }
  return sel;
}

// ---------------------------------------------------------------------------
// Seed function
// ---------------------------------------------------------------------------

export async function seedLocalBudget(opts: {
  accountName: string;
  startingBalance: number;
  selectedCategories: CategorySelection;
}): Promise<void> {
  const { accountName, startingBalance, selectedCategories } = opts;

  await batchMessages(async () => {
    let groupSort = 1000;

    for (const group of DEFAULT_CATEGORY_GROUPS) {
      const hasSelected = group.categories.some(c => selectedCategories[c.key]);

      // Always create Income group (required by getStartingBalancePayee)
      if (!hasSelected && !group.is_income) {
        groupSort += 1000;
        continue;
      }

      const groupId = await createCategoryGroup({
        name: group.name,
        is_income: group.is_income,
        sort_order: groupSort,
      });
      groupSort += 1000;

      let catSort = 1000;
      for (const cat of group.categories) {
        // Always create "Starting Balances" (required by createAccount)
        if (!selectedCategories[cat.key] && cat.key !== 'starting_balances') {
          catSort += 1000;
          continue;
        }

        await createCategory({
          name: cat.name,
          cat_group: groupId,
          is_income: group.is_income,
          sort_order: catSort,
        });
        catSort += 1000;
      }
    }

    await createAccount(
      { name: accountName, offbudget: false },
      startingBalance,
    );
  });

  await refreshAllRegisteredStores();
}
