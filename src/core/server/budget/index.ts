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
import { batchMessages } from "@/core/server/sync/batch";
import { doTransfer, hasBudgetedAmount } from "./actions";
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
  const row = await db.first<Pick<CategoryRow, "is_income">>(
    "SELECT is_income FROM categories WHERE id = ?",
    [id],
  );
  if (!row) throw new Error(`Category with id ${id} not found.`);

  if (transferId) {
    const transfer = await db.first<Pick<CategoryRow, "is_income">>(
      "SELECT is_income FROM categories WHERE id = ?",
      [transferId],
    );
    if (!transfer) throw new Error(`Transfer category with id ${transferId} not found.`);
    // Money can't cross the income/expense line — the two sides aren't the same
    // kind of number.
    if (row.is_income !== transfer.is_income) {
      throw new Error("Cannot transfer between income and expense categories.");
    }

    // TODO: We should do this for income too if it's a tracking budget.
    if (row.is_income === 0) await doTransfer([id], transferId);
  }

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

/**
 * Bring hidden categories and groups back into view.
 *
 * ## Two rules of scope
 *
 * **Ask for a group and it comes back whole** — every one of its categories is
 * cleared, including any that had been hidden on its own before the group was.
 * Honouring that older flag would hand back a group with holes in it, for a
 * decision made weeks ago that nobody remembers making.
 *
 * **Ask for one category out of a hidden group and only that one comes back.**
 * Its own flag is already `0` — it is out of sight solely because the group is,
 * and setting `0` again does nothing, since `buildBudgetSections` drops the whole
 * group before it looks at its categories. So the group has to open, and its
 * siblings get pinned `hidden = 1` or they all reappear uninvited.
 *
 * ## Divergence from upstream
 *
 * There is no counterpart there: upstream has no bulk unhide for categories, and
 * more to the point never needs one — hidden things stay reachable inline behind
 * the `budget.showHiddenCategories` pref, and each row's menu flips its own flag,
 * one at a time. See {@link HiddenCategoriesScreen} for why this port went a
 * different way. The *shape* is upstream's though, copied from `tags-unhide-all`
 * (`loot-core/src/server/tags/app.ts`): one `undoable` around the sweep with
 * `batchMessages` inside, rather than N calls from the caller — `undoable` opens
 * an undo group per call, so N calls would mean N steps to undo one action, and
 * N spreadsheet recomputes instead of one.
 */
export const unhideItems = undoable(async function unhideItems({
  categoryIds = [],
  groupIds = [],
}: {
  categoryIds?: string[];
  groupIds?: string[];
}): Promise<void> {
  const wanted = new Set(categoryIds);
  const askedForGroups = new Set(groupIds);

  // Which groups have to open for the picked categories to actually show, and
  // which of those weren't asked for on their own (so their siblings get pinned).
  const groupsToOpen = new Set(askedForGroups);
  const groupsOpenedForACategory = new Set<string>();

  for (const id of categoryIds) {
    const row = await db.first<Pick<CategoryRow, "cat_group">>(
      "SELECT cat_group FROM categories WHERE id = ?",
      [id],
    );
    const groupId = row?.cat_group;
    if (!groupId || askedForGroups.has(groupId)) continue;

    const group = await db.first<Pick<CategoryGroupRow, "hidden">>(
      "SELECT hidden FROM category_groups WHERE id = ?",
      [groupId],
    );
    if (group?.hidden === 1) {
      groupsToOpen.add(groupId);
      groupsOpenedForACategory.add(groupId);
    }
  }

  const toPin: string[] = [];
  for (const groupId of groupsOpenedForACategory) {
    const siblings = await db.all<Pick<CategoryRow, "id">>(
      "SELECT id FROM categories WHERE cat_group = ? AND tombstone = 0",
      [groupId],
    );
    for (const sibling of siblings) {
      if (!wanted.has(sibling.id)) toPin.push(sibling.id);
    }
  }

  // A group asked for by name comes back whole, so its categories join the
  // clear list — the opposite of the pinning above, and deliberately so.
  for (const groupId of askedForGroups) {
    const members = await db.all<Pick<CategoryRow, "id">>(
      "SELECT id FROM categories WHERE cat_group = ? AND tombstone = 0",
      [groupId],
    );
    for (const member of members) wanted.add(member.id);
  }

  await batchMessages(async () => {
    for (const id of groupsToOpen) {
      await db.updateCategoryGroup({ id, hidden: 0 });
    }
    for (const id of toPin) {
      await db.updateCategory({ id, hidden: 1 });
    }
    for (const id of wanted) {
      await db.updateCategory({ id, hidden: 0 });
    }
  });
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
  if (transferId) {
    // No is_income guard here, matching upstream: a group delete transfers all
    // its live categories, and the picker only ever offers expense targets.
    const groupCategories = await db.all<Pick<CategoryRow, "id">>(
      "SELECT id FROM categories WHERE cat_group = ? AND tombstone = 0",
      [id],
    );
    await doTransfer(
      groupCategories.map((c) => c.id),
      transferId,
    );
  }

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
 * Money already assigned counts too: deleting a category that holds budget
 * without nominating a destination evaporates it.
 */
export async function isCategoryTransferRequired(id: string): Promise<boolean> {
  const rows = await db.all<{ count: number }>(
    `SELECT COUNT(t.id) as count FROM transactions t
       LEFT JOIN category_mapping cm ON cm.id = t.category
       WHERE cm.transferId = ? AND t.tombstone = 0`,
    [id],
  );
  if ((rows[0]?.count ?? 0) > 0) return true;

  return hasBudgetedAmount(id);
}
