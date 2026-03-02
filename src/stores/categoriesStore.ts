import { create } from 'zustand';
import {
  getCategories,
  getCategoryGroups,
  getCategoriesGrouped,
  createCategory,
  createCategoryGroup,
  updateCategory,
  deleteCategory,
  deleteCategoryGroup,
} from '../categories';
import type { Category, CategoryGroup } from '../categories/types';

type CategoriesState = {
  groups: CategoryGroup[];
  categories: Category[];
  loading: boolean;
  load(): Promise<void>;
  createGroup(name: string, is_income?: boolean): Promise<string>;
  createCategory(name: string, groupId: string): Promise<string>;
  updateCategory(id: string, fields: Partial<Pick<Category, 'name' | 'hidden' | 'sort_order' | 'goal_def'>>): Promise<void>;
  deleteCategory(id: string): Promise<void>;
  deleteCategoryGroup(id: string): Promise<void>;
};

export const useCategoriesStore = create<CategoriesState>((set) => ({
  groups: [],
  categories: [],
  loading: false,

  async load() {
    set({ loading: true });
    try {
      const [categories, groups] = await Promise.all([
        getCategories(),
        getCategoryGroups(),
      ]);
      set({ categories, groups });
    } finally {
      set({ loading: false });
    }
  },

  async createGroup(name, is_income = false) {
    return createCategoryGroup({ name, is_income });
  },

  async createCategory(name, groupId) {
    return createCategory({ name, cat_group: groupId });
  },

  async updateCategory(id, fields) {
    return updateCategory(id, fields);
  },

  async deleteCategory(id) {
    return deleteCategory(id);
  },

  async deleteCategoryGroup(id) {
    return deleteCategoryGroup(id);
  },
}));
