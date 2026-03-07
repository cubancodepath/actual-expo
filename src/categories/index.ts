import { randomUUID } from 'expo-crypto';
import { runQuery } from '../db';
import { sendMessages } from '../sync';
import { undoable } from '../sync/undo';
import { Timestamp } from '../crdt';
import type { CategoryGroupRow, CategoryRow } from '../db/types';
import type { Category, CategoryGroup } from './types';
import { shoveSortOrders } from './sort';

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

export const createCategoryGroup = undoable(async function createCategoryGroup(
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
});

export const createCategory = undoable(async function createCategory(
  fields: Pick<Category, 'name' | 'cat_group'> & Partial<Pick<Category, 'is_income' | 'sort_order'>>,
): Promise<string> {
  const id = randomUUID();
  const dbFields: Record<string, unknown> = {
    name: fields.name,
    cat_group: fields.cat_group,
    is_income: fields.is_income ? 1 : 0,
    sort_order: fields.sort_order ?? Date.now(),
  };
  await sendMessages([
    ...Object.entries(dbFields).map(([column, value]) => ({
      timestamp: Timestamp.send()!, dataset: 'categories', row: id, column,
      value: value as string | number | null,
    })),
    // Self-referential mapping — mirrors loot-core's insertCategory behaviour.
    // Required so the chaining logic in deleteCategory can walk the full graph.
    { timestamp: Timestamp.send()!, dataset: 'category_mapping', row: id, column: 'transferId', value: id },
  ]);
  return id;
});

export const updateCategory = undoable(async function updateCategory(
  id: string,
  fields: Partial<Pick<Category, 'name' | 'hidden' | 'sort_order' | 'goal_def'> & { template_settings: string }>,
): Promise<void> {
  const dbFields: Record<string, unknown> = {};
  if (fields.name !== undefined) dbFields.name = fields.name;
  if (fields.hidden !== undefined) dbFields.hidden = fields.hidden ? 1 : 0;
  if (fields.sort_order !== undefined) dbFields.sort_order = fields.sort_order;
  if (fields.goal_def !== undefined) dbFields.goal_def = fields.goal_def;
  if (fields.template_settings !== undefined) dbFields.template_settings = fields.template_settings;
  if (Object.keys(dbFields).length === 0) return;
  await sendMessages(
    Object.entries(dbFields).map(([column, value]) => ({
      timestamp: Timestamp.send()!, dataset: 'categories', row: id, column,
      value: value as string | number | null,
    })),
  );
});

export const deleteCategory = undoable(async function deleteCategory(id: string, transferId?: string): Promise<void> {
  if (transferId) {
    // Walk every mapping that currently points to `id` and forward it to `transferId`.
    // This handles chains: if A → id, after deletion A should point to transferId.
    const chained = await runQuery<{ id: string }>(
      'SELECT id FROM category_mapping WHERE transferId = ?',
      [id],
    );
    const chainMsgs = chained.map(m => ({
      timestamp: Timestamp.send()!,
      dataset: 'category_mapping',
      row: m.id,
      column: 'transferId',
      value: transferId as string | number | null,
    }));

    // Map this category itself to transferId
    const selfMsg = {
      timestamp: Timestamp.send()!,
      dataset: 'category_mapping',
      row: id,
      column: 'transferId',
      value: transferId as string | number | null,
    };

    await sendMessages([...chainMsgs, selfMsg]);
  }
  await sendMessages([
    { timestamp: Timestamp.send()!, dataset: 'categories', row: id, column: 'tombstone', value: 1 },
  ]);
});

export const updateCategoryGroup = undoable(async function updateCategoryGroup(
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
});

export async function moveCategoryGroup(
  id: string,
  targetId: string | null = null,
): Promise<void> {
  const groups = await runQuery<{ id: string; sort_order: number }>(
    'SELECT id, sort_order FROM category_groups WHERE tombstone = 0 ORDER BY sort_order ASC, id ASC',
  );

  const { updates, sort_order } = shoveSortOrders(groups, targetId);

  const messages = [
    ...updates.map((u) => ({
      timestamp: Timestamp.send()!,
      dataset: 'category_groups',
      row: u.id,
      column: 'sort_order',
      value: u.sort_order as string | number | null,
    })),
    {
      timestamp: Timestamp.send()!,
      dataset: 'category_groups',
      row: id,
      column: 'sort_order',
      value: sort_order as string | number | null,
    },
  ];
  await sendMessages(messages);
}

export async function moveCategory(
  id: string,
  groupId: string,
  targetId: string | null = null,
): Promise<void> {
  const categories = await runQuery<{ id: string; sort_order: number }>(
    'SELECT id, sort_order FROM categories WHERE cat_group = ? AND tombstone = 0 ORDER BY sort_order ASC, id ASC',
    [groupId],
  );

  const { updates, sort_order } = shoveSortOrders(categories, targetId);

  const messages = [
    ...updates.map((u) => ({
      timestamp: Timestamp.send()!,
      dataset: 'categories',
      row: u.id,
      column: 'sort_order',
      value: u.sort_order as string | number | null,
    })),
    {
      timestamp: Timestamp.send()!,
      dataset: 'categories',
      row: id,
      column: 'sort_order',
      value: sort_order as string | number | null,
    },
    {
      timestamp: Timestamp.send()!,
      dataset: 'categories',
      row: id,
      column: 'cat_group',
      value: groupId as string | number | null,
    },
  ];
  await sendMessages(messages);
}

export const deleteCategoryGroup = undoable(async function deleteCategoryGroup(id: string, transferId?: string): Promise<void> {
  // Cascade: delete every category in this group (mirrors loot-core behavior)
  const groupCategories = await runQuery<{ id: string }>(
    'SELECT id FROM categories WHERE cat_group = ? AND tombstone = 0',
    [id],
  );
  for (const cat of groupCategories) {
    await deleteCategory(cat.id, transferId);
  }
  await sendMessages([
    { timestamp: Timestamp.send()!, dataset: 'category_groups', row: id, column: 'tombstone', value: 1 },
  ]);
});
