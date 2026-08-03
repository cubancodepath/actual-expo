import * as db from "@/core/server/db";
import { batchMessages } from "@/core/server/sync";
import { undoable } from "@/core/server/undo";

/**
 * A whole arrangement of the budget, as the reorder screen holds it before the
 * user commits to it.
 */
export interface CategoryOrder {
  /**
   * Every reorderable group, in the order they should be listed. Income is left
   * out: the budget pins it last whatever its `sort_order` says.
   */
  groups: string[];
  /**
   * Category ids per group, in order. A group missing from here keeps whatever
   * order it has; a category listed under a group it doesn't currently belong to
   * is moved into it.
   */
  categories: Record<string, string[]>;
}

/**
 * Does `current` already list `wanted`'s members in `wanted`'s order?
 *
 * Compared against the filtered `current` rather than the whole of it, because
 * the screen only ever knows about part of it: hidden categories and hidden
 * groups aren't on screen, and neither is the income group. Anything the caller
 * didn't mention is not evidence that something moved.
 */
function alreadyOrdered(current: string[], wanted: string[]): boolean {
  const listed = new Set(wanted);
  const filtered = current.filter((id) => listed.has(id));
  return filtered.length === wanted.length && filtered.every((id, i) => id === wanted[i]);
}

/**
 * Walk a desired sequence backwards, putting each row in front of the one that
 * should follow it and the last one at the end.
 *
 * Every step is an ordinary move, so the `sort_order` arithmetic (and the shove
 * when the gap between two rows runs out) stays in the DB layer — the same trick
 * {@link sortCategories} uses. Backwards is what makes it work from *any*
 * starting arrangement: by the time a row is placed, the row it aims to sit in
 * front of is already where it belongs.
 */
async function relayout(ids: string[], move: (id: string, before: string | null) => Promise<void>) {
  for (let i = ids.length - 1; i >= 0; i--) {
    await move(ids[i], ids[i + 1] ?? null);
  }
}

/**
 * Write a whole arrangement at once.
 *
 * The reorder screen edits locally and commits here, so a session of dragging is
 * one undo step rather than one per drop — and a batch of CRDT messages rather
 * than a burst. Groups and categories that already read the way the caller wants
 * are skipped, so committing an arrangement that only touched one group doesn't
 * rewrite the `sort_order` of everything else.
 */
export const applyCategoryOrder = undoable(async function applyCategoryOrder(
  order: CategoryOrder,
): Promise<void> {
  await batchMessages(async () => {
    const groups = await db.all<{ id: string }>(
      `SELECT id FROM category_groups WHERE tombstone = 0 ORDER BY sort_order, id`,
    );
    if (
      !alreadyOrdered(
        groups.map((g) => g.id),
        order.groups,
      )
    ) {
      await relayout(order.groups, (id, before) => db.moveCategoryGroup(id, before));
    }

    for (const [groupId, ids] of Object.entries(order.categories)) {
      const members = await db.all<{ id: string }>(
        `SELECT id FROM categories WHERE cat_group = ? AND tombstone = 0 ORDER BY sort_order, id`,
        [groupId],
      );
      if (
        alreadyOrdered(
          members.map((c) => c.id),
          ids,
        )
      ) {
        continue;
      }
      await relayout(ids, (id, before) => db.moveCategory(id, groupId, before));
    }
  });
});
