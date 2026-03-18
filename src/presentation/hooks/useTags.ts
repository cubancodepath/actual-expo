/**
 * useTags — reactive tags via liveQuery.
 * Replaces useTagsStore for data reads.
 */

import { q } from "@/queries";
import { useLiveQuery } from "./useQuery";
import type { Tag } from "@/tags/types";

export function useTags() {
  const { data, isLoading } = useLiveQuery<Tag>(
    () => q("tags"),
    [],
  );
  return { tags: data ?? [], isLoading };
}
