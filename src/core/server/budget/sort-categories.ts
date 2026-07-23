/**
 * Sort order utilities — ported from Actual Budget's loot-core/server/db/sort.ts.
 *
 * Uses a midpoint-based algorithm with lazy "shoving" to maintain sort order
 * gaps between items, minimizing the number of updates needed per reorder.
 */

export const SORT_INCREMENT = 16384;

function midpoint<T extends { sort_order: number }>(items: T[], to: number): number {
  const below = items[to - 1];
  const above = items[to];

  if (!below) {
    return above.sort_order / 2;
  } else if (!above) {
    return below.sort_order + SORT_INCREMENT;
  } else {
    return (below.sort_order + above.sort_order) / 2;
  }
}

/**
 * Calculate the sort_order for an item being inserted before `targetId`.
 * If targetId is null, the item is appended at the end.
 *
 * Returns:
 * - `sort_order`: the value to assign to the moved item
 * - `updates`: any sibling items that need their sort_order "shoved" to make room
 */
export function shoveSortOrders<T extends { id: string; sort_order: number }>(
  items: T[],
  targetId: string | null = null,
): { updates: Array<{ id: string; sort_order: number }>; sort_order: number } {
  const to = items.findIndex((item) => item.id === targetId);
  const target = items[to];
  const before = items[to - 1];
  const updates: Array<{ id: string; sort_order: number }> = [];

  if (!targetId || to === -1) {
    let order: number;
    if (items.length > 0) {
      order = items[items.length - 1].sort_order + SORT_INCREMENT;
    } else {
      order = SORT_INCREMENT;
    }
    return { updates, sort_order: order };
  } else {
    if (target.sort_order - (before ? before.sort_order : 0) <= 2) {
      let next = to;
      let order = Math.floor(items[next].sort_order) + SORT_INCREMENT;
      while (next < items.length) {
        if (order <= items[next].sort_order) {
          break;
        }
        updates.push({ id: items[next].id, sort_order: order });
        next++;
        order += SORT_INCREMENT;
      }
    }
    return { updates, sort_order: midpoint(items, to) };
  }
}
