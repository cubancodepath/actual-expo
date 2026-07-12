export type LetterSection<T> = { letter: string; items: T[] };

/**
 * Group items into alphabetical sections by their name's first letter (A–Z),
 * bucketing anything non-alphabetic under "#". Sections and items are sorted;
 * "#" sorts last. Pure — safe to call from a `useMemo`.
 */
export function groupByInitial<T>(items: T[], getName: (item: T) => string): LetterSection<T>[] {
  const buckets = new Map<string, T[]>();
  for (const item of items) {
    const first = getName(item).trim().charAt(0).toUpperCase();
    const letter = first >= "A" && first <= "Z" ? first : "#";
    const bucket = buckets.get(letter);
    if (bucket) bucket.push(item);
    else buckets.set(letter, [item]);
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => (a === "#" ? 1 : b === "#" ? -1 : a.localeCompare(b)))
    .map(([letter, list]) => ({
      letter,
      items: list.sort((x, y) => getName(x).localeCompare(getName(y))),
    }));
}
