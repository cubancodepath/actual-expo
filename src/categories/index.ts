import { randomUUID } from 'expo-crypto';
import { runQuery } from '../db';
import { sendMessages } from '../sync';
import { Timestamp } from '../crdt';
import type { CategoryGroupRow, CategoryRow } from '../db/types';
import type { Category, CategoryGroup } from './types';

function rowToGroup(r: CategoryGroupRow): CategoryGroup {
  return {
    id: r.id,
    name: r.name,
    is_income: r.is_income === 1,
    sort_order: r.sort_order,
    hidden: r.hidden === 1,
    tombstone: r.tombstone === 1,
  };
}

function rowToCategory(r: CategoryRow): Category {
  return {
    id: r.id,
    name: r.name,
    is_income: r.is_income === 1,
    cat_group: r.cat_group,
    sort_order: r.sort_order,
    hidden: r.hidden === 1,
    goal_def: r.goal_def,
    tombstone: r.tombstone === 1,
  };
}

export async function getCategoryGroups(): Promise<CategoryGroup[]> {
  return (
    await runQuery<CategoryGroupRow>(
      'SELECT * FROM category_groups WHERE tombstone = 0 ORDER BY sort_order ASC',
    )
  ).map(rowToGroup);
}

export async function getCategories(): Promise<Category[]> {
  return (
    await runQuery<CategoryRow>(
      'SELECT * FROM categories WHERE tombstone = 0 ORDER BY sort_order ASC',
    )
  ).map(rowToCategory);
}

export async function getCategoriesGrouped(): Promise<CategoryGroup[]> {
  const groups = await getCategoryGroups();
  const categories = await getCategories();
  return groups.map(g => ({
    ...g,
    categories: categories.filter(c => c.cat_group === g.id),
  }));
}

export async function createCategoryGroup(
  fields: Pick<CategoryGroup, 'name'> & Partial<Pick<CategoryGroup, 'is_income' | 'sort_order'>>,
): Promise<string> {
  const id = randomUUID();
  const dbFields: Record<string, unknown> = {
    name: fields.name,
    is_income: fields.is_income ? 1 : 0,
    sort_order: fields.sort_order ?? Date.now(),
  };
  await sendMessages(
    Object.entries(dbFields).map(([column, value]) => ({
      timestamp: Timestamp.send()!, dataset: 'category_groups', row: id, column,
      value: value as string | number | null,
    })),
  );
  return id;
}

export async function createCategory(
  fields: Pick<Category, 'name' | 'cat_group'> & Partial<Pick<Category, 'is_income' | 'sort_order'>>,
): Promise<string> {
  const id = randomUUID();
  const dbFields: Record<string, unknown> = {
    name: fields.name,
    cat_group: fields.cat_group,
    is_income: fields.is_income ? 1 : 0,
    sort_order: fields.sort_order ?? Date.now(),
  };
  await sendMessages(
    Object.entries(dbFields).map(([column, value]) => ({
      timestamp: Timestamp.send()!, dataset: 'categories', row: id, column,
      value: value as string | number | null,
    })),
  );
  return id;
}

export async function updateCategory(
  id: string,
  fields: Partial<Pick<Category, 'name' | 'hidden' | 'sort_order' | 'goal_def'>>,
): Promise<void> {
  const dbFields: Record<string, unknown> = {};
  if (fields.name !== undefined) dbFields.name = fields.name;
  if (fields.hidden !== undefined) dbFields.hidden = fields.hidden ? 1 : 0;
  if (fields.sort_order !== undefined) dbFields.sort_order = fields.sort_order;
  if (fields.goal_def !== undefined) dbFields.goal_def = fields.goal_def;
  if (Object.keys(dbFields).length === 0) return;
  await sendMessages(
    Object.entries(dbFields).map(([column, value]) => ({
      timestamp: Timestamp.send()!, dataset: 'categories', row: id, column,
      value: value as string | number | null,
    })),
  );
}

export async function deleteCategory(id: string): Promise<void> {
  await sendMessages([
    { timestamp: Timestamp.send()!, dataset: 'categories', row: id, column: 'tombstone', value: 1 },
  ]);
}

export async function updateCategoryGroup(
  id: string,
  fields: Partial<Pick<CategoryGroup, 'name' | 'hidden' | 'sort_order'>>,
): Promise<void> {
  const dbFields: Record<string, unknown> = {};
  if (fields.name !== undefined) dbFields.name = fields.name;
  if (fields.hidden !== undefined) dbFields.hidden = fields.hidden ? 1 : 0;
  if (fields.sort_order !== undefined) dbFields.sort_order = fields.sort_order;
  if (Object.keys(dbFields).length === 0) return;
  await sendMessages(
    Object.entries(dbFields).map(([column, value]) => ({
      timestamp: Timestamp.send()!, dataset: 'category_groups', row: id, column,
      value: value as string | number | null,
    })),
  );
}

export async function deleteCategoryGroup(id: string): Promise<void> {
  await sendMessages([
    { timestamp: Timestamp.send()!, dataset: 'category_groups', row: id, column: 'tombstone', value: 1 },
  ]);
}
