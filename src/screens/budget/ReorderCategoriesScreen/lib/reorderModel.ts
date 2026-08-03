import type { BudgetSection } from "@/screens/budget/hooks/useBudgetSections";

/**
 * The reorder screen's data model — pure, so the index arithmetic that turns a
 * drop into a `moveCategory` call can be tested in Node.
 *
 * ## Why a flat list
 *
 * Groups and their categories are drawn as separate cards everywhere else in the
 * app, and a card per group is what the drag library cannot do: each list is its
 * own drag container, so a category could never leave its group. Dragging
 * between groups is the whole point here, so the list is *one* flat array —
 * headers and category rows interleaved — dressed up to look like the cards it
 * isn't (see `cornersAt`).
 *
 * Headers are inert: they're rendered without a drag handle, so the library
 * never picks them up. That makes them boundary markers, which is exactly what
 * the drop arithmetic needs: **the nearest header above a dropped row names the
 * group it landed in.**
 *
 * ## Why two row sets
 *
 * A drag moves one row, so a header could never carry its categories with it.
 * Reordering the groups is therefore a second, shorter list — the same groups
 * with their categories collapsed away ({@link toGroupRows}) — that the screen
 * swaps in while a group is being moved.
 */

/** A group's name row. Never draggable — it's the group boundary. */
export interface ReorderHeaderRow {
  kind: "header";
  key: string;
  groupId: string;
  name: string;
  isIncome: boolean;
}

/** A draggable category row. `groupId` is the group it currently belongs to. */
export interface ReorderCategoryRowData {
  kind: "category";
  key: string;
  id: string;
  groupId: string;
  name: string;
  isIncome: boolean;
}

export type ReorderRow = ReorderHeaderRow | ReorderCategoryRowData;

/**
 * Take the row at `from` out and put it back at `to`.
 *
 * This is `reorderItems` from the drag library, reimplemented here for two
 * reasons: the drop arithmetic is only correct against *this* definition of a
 * move, so it belongs next to it, and importing the library into a Node test
 * pulls in its React Native internals and fails to parse.
 */
export function moveRow<T>(rows: T[], from: number, to: number): T[] {
  const next = [...rows];
  next.splice(to, 0, next.splice(from, 1)[0]);
  return next;
}

/** Keys are prefixed so a group and a category can never collide in the list. */
export function flattenSections(sections: BudgetSection[]): ReorderRow[] {
  const rows: ReorderRow[] = [];
  for (const section of sections) {
    rows.push({
      kind: "header",
      key: `group:${section.id}`,
      groupId: section.id,
      name: section.name,
      isIncome: section.is_income,
    });
    for (const category of section.categories) {
      rows.push({
        kind: "category",
        key: `cat:${category.id}`,
        id: category.id,
        groupId: section.id,
        name: category.name,
        isIncome: category.is_income,
      });
    }
  }
  return rows;
}

/**
 * Which corners a row rounds, so a run of rows reads as one card: the first row
 * of a group rounds its top, the last rounds its bottom, and a lone category
 * rounds both. Derived from the row's neighbours rather than stored, so it stays
 * true after a reorder without anything having to be recomputed.
 */
export function cornersAt(
  rows: ReorderRow[],
  index: number,
): { isFirst: boolean; isLast: boolean } {
  const previous = rows[index - 1];
  const next = rows[index + 1];
  return {
    isFirst: !previous || previous.kind === "header",
    isLast: !next || next.kind === "header",
  };
}

export type DropResolution =
  | {
      ok: true;
      categoryId: string;
      name: string;
      /** The group it landed in — written to `cat_group` by the move. */
      groupId: string;
      /** Insert *before* this category, or append to the group when null. */
      targetId: string | null;
      /** Whether it changed groups, which is what needs the duplicate check. */
      isCrossGroup: boolean;
    }
  | { ok: false; reason: "invalid" | "income-boundary" };

/**
 * Reads a landed row's new group and neighbour out of the already-reordered
 * array. `index` is where the dragged row now sits.
 *
 * `targetId` follows the core's contract ({@link moveCategory}): the id to
 * insert *before*, or null to append to the end of the group. A row that landed
 * last in its group has a header (or nothing) after it, which is the null case.
 *
 * Two drops are refused rather than silently reinterpreted:
 * - above the very first header, where there is no group to land in;
 * - across the income/expense line, since an income category in an expense group
 *   (or the reverse) is not a thing the budget can represent.
 */
export function resolveCategoryDrop(rows: ReorderRow[], index: number): DropResolution {
  const moved = rows[index];
  if (!moved || moved.kind !== "category") return { ok: false, reason: "invalid" };

  let cursor = index - 1;
  while (cursor >= 0 && rows[cursor].kind !== "header") cursor--;
  const header = cursor >= 0 ? (rows[cursor] as ReorderHeaderRow) : null;
  if (!header) return { ok: false, reason: "invalid" };

  if (header.isIncome !== moved.isIncome) return { ok: false, reason: "income-boundary" };

  const next = rows[index + 1];
  return {
    ok: true,
    categoryId: moved.id,
    name: moved.name,
    groupId: header.groupId,
    targetId: next && next.kind === "category" ? next.id : null,
    isCrossGroup: header.groupId !== moved.groupId,
  };
}

/**
 * Re-homes the moved row so the optimistic list agrees with what was persisted.
 * Without this a second drag of the same row would still read its old group and
 * mistake a cross-group move for a within-group one.
 */
export function withGroupPatched(rows: ReorderRow[], index: number, groupId: string): ReorderRow[] {
  const moved = rows[index];
  if (!moved || moved.kind !== "category" || moved.groupId === groupId) return rows;
  const next = [...rows];
  next[index] = { ...moved, groupId };
  return next;
}

/**
 * Upstream's guard before a cross-group move (`useReorderCategoryMutation`):
 * two categories with the same name in one group is a state `insertCategory`
 * refuses to create, and `moveCategory` — which does no such check — would walk
 * straight into. Compared case-insensitively, matching the `UPPER(name)` lookup
 * the insert path uses.
 *
 * Takes raw categories (hidden ones included) rather than the screen's visible
 * sections: a hidden namesake still occupies the name.
 */
export function hasDuplicateName(
  categories: { id: string; name: string; group: string }[],
  name: string,
  groupId: string,
  movingId: string,
): boolean {
  const wanted = name.toUpperCase();
  return categories.some(
    (c) => c.id !== movingId && c.group === groupId && c.name.toUpperCase() === wanted,
  );
}

/**
 * A whole group as one draggable row — what the list shows while the categories
 * are collapsed. The count is its subtitle, since its contents aren't on screen.
 */
export interface ReorderGroupRowData {
  kind: "group";
  key: string;
  id: string;
  name: string;
  categoryCount: number;
}

/** Either row set the one list can be showing. */
export type UnifiedRow = ReorderRow | ReorderGroupRowData;

/**
 * The groups that can be reordered: everything except income, which the budget
 * always sorts last regardless of `sort_order` (see `buildBudgetSections`), so
 * dragging it would be a move with no visible effect.
 *
 * The key is the same one {@link flattenSections} gives that group's header. A
 * group therefore keeps its list cell across the collapse, which is what lets the
 * header morph into the row instead of one unmounting and the other appearing.
 */
export function toGroupRows(sections: BudgetSection[]): ReorderGroupRowData[] {
  return sections
    .filter((s) => !s.is_income)
    .map((s) => ({
      kind: "group" as const,
      key: `group:${s.id}`,
      id: s.id,
      name: s.name,
      categoryCount: s.categories.length,
    }));
}

/**
 * Re-sort the sections into the order the collapsed list is currently showing.
 *
 * A group move is optimistic: the list is already in the new order while the CRDT
 * write is in flight. Expanding straight after a drop would otherwise re-read the
 * groups from `liveQuery` and flash the old order for a frame, so the categories
 * are rebuilt against the order the user just made instead. Income is pinned last
 * either way, matching `buildBudgetSections`.
 */
export function sortSectionsByGroupOrder(
  sections: BudgetSection[],
  orderedIds: string[],
): BudgetSection[] {
  const rank = new Map(orderedIds.map((id, i) => [id, i]));
  // Anything the order doesn't mention (income, or a group that arrived since)
  // sorts after everything it does, keeping its relative place — hence a rank
  // past the end rather than Infinity, whose difference with itself is NaN.
  const unranked = orderedIds.length;
  const at = (s: BudgetSection) => (s.is_income ? unranked : (rank.get(s.id) ?? unranked));
  return [...sections].sort((a, b) => at(a) - at(b));
}

/** Same "insert before, null appends" contract as {@link resolveCategoryDrop}. */
export function resolveGroupDrop(
  rows: ReorderGroupRowData[],
  index: number,
): { id: string; targetId: string | null } | null {
  const moved = rows[index];
  if (!moved) return null;
  const next = rows[index + 1];
  return { id: moved.id, targetId: next ? next.id : null };
}
