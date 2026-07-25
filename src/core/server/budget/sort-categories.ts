import * as db from "@/core/server/db";
import { batchMessages } from "@/core/server/sync";
import type { CategoryGroup } from "@/core/types/models";

/**
 * Sort one group's categories alphabetically — upstream's `categories-sort`
 * handler, ported verbatim.
 *
 * Walks the sorted list backwards, moving each category in front of the one that
 * should follow it (and the last one to the end), so every step is an ordinary
 * `moveCategory` and the sort_order maths stay in the DB layer.
 */
export async function sortCategories({
  groupId,
  direction,
}: {
  groupId: CategoryGroup["id"];
  direction: "asc" | "desc";
}): Promise<void> {
  const groups = await db.getCategoriesGrouped();
  const group = groups.find((g) => g.id === groupId);
  if (!group?.categories?.length) return;

  const sorted = [...group.categories].sort((a, b) =>
    direction === "asc" ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name),
  );

  for (let i = sorted.length - 1; i >= 0; i--) {
    await batchMessages(async () => {
      await db.moveCategory(
        sorted[i].id,
        groupId,
        i === sorted.length - 1 ? null : sorted[i + 1].id,
      );
    });
  }
}
