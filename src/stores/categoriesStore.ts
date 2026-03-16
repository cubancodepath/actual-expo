import { create } from "zustand";
import { registerStore } from "./storeRegistry";
import {
  getCategories,
  getCategoryGroups,
  getCategoriesGrouped,
  createCategory,
  createCategoryGroup,
  updateCategory,
  updateCategoryGroup,
  moveCategory,
  moveCategoryGroup,
  deleteCategory,
  deleteCategoryGroup,
} from "../categories";
import type { Category, CategoryGroup } from "../categories/types";
import { setGoalTemplates } from "../goals";
import type { Template } from "../goals/types";

type CategoriesState = {
  groups: CategoryGroup[];
  categories: Category[];
  loading: boolean;
  load(): Promise<void>;
  createGroup(name: string, is_income?: boolean): Promise<string>;
  createCategory(name: string, groupId: string): Promise<string>;
  updateCategory(
    id: string,
    fields: Partial<Pick<Category, "name" | "hidden" | "sort_order" | "goal_def">>,
  ): Promise<void>;
  updateCategoryGroup(
    id: string,
    fields: Partial<Pick<CategoryGroup, "name" | "hidden" | "sort_order">>,
  ): Promise<void>;
  moveCategory(id: string, groupId: string, targetId?: string | null): Promise<void>;
  moveCategoryGroup(id: string, targetId?: string | null): Promise<void>;
  deleteCategory(id: string, transferId?: string): Promise<void>;
  deleteCategoryGroup(id: string, transferId?: string): Promise<void>;
  setGoalDef(categoryId: string, templates: Template[]): Promise<void>;
};

export const useCategoriesStore = create<CategoriesState>((set) => ({
  groups: [],
  categories: [],
  loading: false,

  async load() {
    set({ loading: true });
    try {
      const [categories, groups] = await Promise.all([getCategories(), getCategoryGroups()]);
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

  async updateCategoryGroup(id, fields) {
    return updateCategoryGroup(id, fields);
  },

  async moveCategory(id, groupId, targetId = null) {
    await moveCategory(id, groupId, targetId);
  },

  async moveCategoryGroup(id, targetId = null) {
    await moveCategoryGroup(id, targetId);
  },

  async deleteCategory(id, transferId) {
    return deleteCategory(id, transferId);
  },

  async deleteCategoryGroup(id, transferId) {
    return deleteCategoryGroup(id, transferId);
  },

  async setGoalDef(categoryId, templates) {
    await setGoalTemplates(categoryId, templates);
  },
}));

registerStore("categories", ["categories", "category_groups", "category_mapping"], () =>
  useCategoriesStore.getState().load(),
);
