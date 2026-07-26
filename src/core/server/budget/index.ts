/**
 * Category / category-group handlers — mirrors upstream's `server/budget/app.ts`.
 *
 * This layer does what upstream's handlers do and nothing more: validate the
 * request, map between entities and DB rows, and wrap the mutation in `undoable`.
 * The SQL, the duplicate-name rules and the sort_order maths belong to the DB
 * layer (`@/core/server/db`) — never reimplement them here.
 *
 * Divergence from upstream, on purpose: `updateCategory`/`updateCategoryGroup`
 * take `(id, fields)` partials instead of a whole entity. Upstream can take the
 * entity because its updates always come from a form; ours are targeted (toggle
 * `hidden`, set `goal_def`), and the entity shape would force a read-modify-write
 * at every call site.
 */
import * as db from "@/core/server/db";
import { undoable } from "@/core/server/undo";
import type { CategoryGroupRow, CategoryRow } from "@/core/server/db/types";
import type { Category, CategoryGroup } from "@/core/types/models";

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
    group: r.cat_group,
    sort_order: r.sort_order,
    hidden: r.hidden === 1,
    goal_def: r.goal_def,
    tombstone: r.tombstone === 1,
  };
}

export async function getCategoryGroups({ hidden }: { hidden?: boolean } = {}): Promise<
  CategoryGroup[]
> {
  const groups = (await db.getCategoryGroups()).map(rowToGroup);
  return hidden === undefined ? groups : groups.filter((g) => g.hidden === hidden);
}

export async function getCategories({ hidden }: { hidden?: boolean } = {}): Promise<Category[]> {
  const categories = (await db.getCategories()).map(rowToCategory);
  return hidden === undefined ? categories : categories.filter((c) => c.hidden === hidden);
}

export async function getCategory(id: string): Promise<Category | null> {
  const row = await db.getCategory(id);
  return row ? rowToCategory(row) : null;
}

export async function getCategoriesGrouped(): Promise<CategoryGroup[]> {
  return (await db.getCategoriesGrouped()).map((g) => ({
    ...rowToGroup(g),
    categories: g.categories.map(rowToCategory),
  }));
}

export const createCategoryGroup = undoable(async function createCategoryGroup({
  name,
  isIncome,
  hidden,
  sortOrder,
}: {
  name: string;
  isIncome?: boolean;
  hidden?: boolean;
  /** Expo-only escape hatch for the seeder — see `db.insertCategoryGroup`. */
  sortOrder?: number;
}): Promise<string> {
  return db.insertCategoryGroup({
    name: name.trim(),
    is_income: isIncome ? 1 : 0,
    hidden: hidden ? 1 : 0,
    ...(sortOrder !== undefined && { sort_order: sortOrder }),
  });
});

export const createCategory = undoable(async function createCategory({
  name,
  groupId,
  isIncome,
  hidden,
  sortOrder,
}: {
  name: string;
  groupId: string;
  isIncome?: boolean;
  hidden?: boolean;
  /** Expo-only escape hatch for the seeder — see `db.insertCategory`. */
  sortOrder?: number;
}): Promise<string> {
  if (!groupId) {
    // Plain Error, like the duplicate-name rejections in the DB layer: these
    // are user-facing messages the sheet shows verbatim, not coded failures the
    // error bus routes. (Upstream throws `APIError` here, same idea.)
    throw new Error("Creating a category: groupId is required");
  }

  return db.insertCategory({
    name: name.trim(),
    cat_group: groupId,
    is_income: isIncome ? 1 : 0,
    hidden: hidden ? 1 : 0,
    ...(sortOrder !== undefined && { sort_order: sortOrder }),
  });
});

export const updateCategory = undoable(async function updateCategory(
  id: string,
  fields: Partial<
    Pick<Category, "name" | "hidden" | "sort_order" | "goal_def"> & { template_settings: string }
  >,
): Promise<void> {
  await db.updateCategory({
    id,
    ...(fields.name !== undefined && { name: fields.name.trim() }),
    ...(fields.hidden !== undefined && { hidden: fields.hidden ? 1 : 0 }),
    ...(fields.sort_order !== undefined && { sort_order: fields.sort_order }),
    ...(fields.goal_def !== undefined && { goal_def: fields.goal_def }),
    ...(fields.template_settings !== undefined && {
      template_settings: fields.template_settings,
    }),
  } as Partial<CategoryRow> & { id: string });
});

export const deleteCategory = undoable(async function deleteCategory(
  id: string,
  transferId?: string,
): Promise<void> {
  await db.deleteCategory({ id }, transferId);
});

export const updateCategoryGroup = undoable(async function updateCategoryGroup(
  id: string,
  fields: Partial<Pick<CategoryGroup, "name" | "hidden" | "sort_order">>,
): Promise<void> {
  await db.updateCategoryGroup({
    id,
    ...(fields.name !== undefined && { name: fields.name.trim() }),
    ...(fields.hidden !== undefined && { hidden: fields.hidden ? 1 : 0 }),
    ...(fields.sort_order !== undefined && { sort_order: fields.sort_order }),
  } as Partial<CategoryGroupRow> & { id: string });
});

export const moveCategoryGroup = undoable(async function moveCategoryGroup(
  id: string,
  targetId: string | null = null,
): Promise<void> {
  await db.moveCategoryGroup(id, targetId);
});

export const moveCategory = undoable(async function moveCategory(
  id: string,
  groupId: string,
  targetId: string | null = null,
): Promise<void> {
  await db.moveCategory(id, groupId, targetId);
});

export const deleteCategoryGroup = undoable(async function deleteCategoryGroup(
  id: string,
  transferId?: string,
): Promise<void> {
  await db.deleteCategoryGroup({ id }, transferId);
});

/**
 * Whether deleting this category needs the caller to nominate a transfer target
 * first — true once anything still points at it. Upstream's `must-category-transfer`.
 *
 * Resolves through `category_mapping` rather than counting `transactions.category`
 * directly, because nothing ever rewrites that column: a category that inherited
 * transactions from a deleted one is only reachable through its mapping, and a
 * direct count would wave it through and strand them a second time.
 *
 * Upstream also refuses when the category holds a non-zero budget in any created
 * month. Not ported — that needs `createdMonths`, and the money side of this
 * (`doTransfer`) isn't ported either.
 */
export async function isCategoryTransferRequired(id: string): Promise<boolean> {
  const rows = await db.all<{ count: number }>(
    `SELECT COUNT(t.id) as count FROM transactions t
       LEFT JOIN category_mapping cm ON cm.id = t.category
       WHERE cm.transferId = ? AND t.tombstone = 0`,
    [id],
  );
  return (rows[0]?.count ?? 0) > 0;
}
